<?php
/*
 * The contact form on konta.md/contact/. Receives one message and mails it to mail@konta.md, in
 * Konta's branded layout with a plain-text part beside it. Subject: "[konta.md] <Name> from
 * <Company> on <Topic>".
 *
 * The file itself holds no secret: it sends through the host's own mail(), which Hostinger
 * delivers for the domain's own addresses, and the SPF record already covers. If PHP were ever
 * switched off and this file served as text, nothing would leak. The one secret it uses lives
 * outside public_html, see below.
 *
 * Answers JSON to the page's script (Accept: application/json) and a 303 back to the form to a
 * browser without JavaScript, landing on the matching message through the URL fragment.
 *
 * Spam: a honeypot field real people never see, length limits, an Origin that has to be exactly
 * https://konta.md (a post without one is refused too, every current browser sends it on a POST),
 * and at most five attempts an hour from one address. No captcha: the site promises the browser
 * talks to nobody but konta.md.
 *
 * The private directory is konta-private/, next to public_html rather than inside it (on
 * Hostinger, domains/konta.md/konta-private/), so no URL reaches it and no publish overwrites it.
 * It holds two things:
 *
 *   contact-throttle/  one small file per hashed address with the times of its recent attempts.
 *                      Created 0700 on first use. A file untouched for an hour is deleted.
 *   lead-key           the key that signs leads (below). Placed by hand, never in git.
 *
 * Each message also becomes a lead in the operator console's onboarding pipeline, posted from
 * here (the server, not the browser) to app.konta.md/api/v1/leads. The post is signed with
 * HMAC-SHA256 so the API can tell a lead that came through this form from one posted at it
 * directly: X-Konta-Lead-Timestamp (unix seconds), X-Konta-Lead-For (the visitor's address, so
 * the API can apply its own limits per visitor rather than per web host), and
 * X-Konta-Lead-Signature, the lowercase hex HMAC of "<timestamp>\n<for>\n<body>". The key is the
 * KONTA_LEAD_KEY environment variable if the host sets one, otherwise konta-private/lead-key; with
 * neither, the lead goes unsigned, exactly as before signing existed. A pipeline that is down or
 * slow never costs the visitor their message: the mail is what counts, and the lead is best effort
 * with a short timeout.
 */

declare(strict_types=1);

// expose_php cannot be switched off from .htaccess on this host, so the version header is taken
// off here, before anything is sent. .htaccess unsets it too, for whatever PHP adds after this.
header_remove('X-Powered-By');

const TO = 'mail@konta.md';
const FROM = 'mail@konta.md';
const PER_HOUR = 5;
const TOPICS = ['demo' => 'Demo', 'partner' => 'Parteneriat', 'efactura' => 'e-Factura', 'other' => 'Altceva'];
// The subject line reads "<Name> from <Company> on <Topic>", so its topic words are English too.
const SUBJECT_TOPICS = ['demo' => 'Demo', 'partner' => 'Partnership', 'efactura' => 'e-Factura', 'other' => 'Other'];
const LANG_NAMES = ['ro' => 'română', 'ru' => 'rusă', 'en' => 'engleză'];
const LANGS = ['ro', 'ru', 'en'];
const LEADS = 'https://app.konta.md/api/v1/leads';
const LEAD_TIMEOUT_SECONDS = 3;
// The only page this form lives on. www.konta.md redirects to it before any page is served, so a
// genuine post never carries another origin.
const ORIGIN = 'https://konta.md';

/**
 * konta-private/ beside the document root, or null when the server does not say where that is.
 * Outside public_html on purpose: nothing in it can be fetched over HTTP, and a publish, which
 * rewrites public_html wholesale, never touches it.
 */
function privateDir(): ?string
{
    $root = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');

    return $root === '' ? null : dirname($root) . '/konta-private';
}

/** The key that signs leads, or null when none has been placed: the lead then goes unsigned. */
function leadKey(): ?string
{
    $env = getenv('KONTA_LEAD_KEY');
    if (is_string($env) && trim($env) !== '') {
        return trim($env);
    }

    $dir = privateDir();
    $file = $dir === null ? null : $dir . '/lead-key';
    if ($file === null || !is_readable($file)) {
        return null;
    }

    $key = trim((string) file_get_contents($file));

    return $key === '' ? null : $key;
}

/**
 * Counts this attempt against the address and says whether it is still within PER_HOUR.
 *
 * Every attempt counts, before anything is sent, so a burst of posts cannot all slip in while
 * the first ones are still being mailed. The file is read and rewritten under an exclusive
 * lock, so two posts at the same moment cannot both read "four" and both write "five". Only the
 * latest PER_HOUR times are kept: that is all the check needs, and it keeps a file hammered by a
 * bot the same few bytes.
 *
 * Returns null when the counter cannot be kept at all. The caller refuses the message then: an
 * uncounted form is an unlimited mail relay into our own inbox and the lead pipeline, and the
 * failure note on the page already gives the visitor mail@konta.md to write to directly.
 */
function withinLimit(string $ip, int $now): ?bool
{
    $base = privateDir();
    if ($base === null) {
        return null;
    }

    $dir = $base . '/contact-throttle';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return null;
    }

    // Addresses kept here are gone an hour after their last attempt, which is what the privacy
    // page promises. A file somebody else holds locked is in use, so it is left for next time.
    // This sweep only runs when somebody posts; a Hostinger cron job running
    //   find ~/domains/konta.md/konta-private/contact-throttle -type f -mmin +60 -delete
    // every quarter of an hour keeps the promise through the hours when nobody does.
    foreach (glob($dir . '/*') ?: [] as $old) {
        if (@filemtime($old) < $now - 3600) {
            $handle = @fopen($old, 'r');
            if ($handle !== false && flock($handle, LOCK_EX | LOCK_NB)) {
                @unlink($old);
            }
            if ($handle !== false) {
                fclose($handle);
            }
        }
    }

    $handle = @fopen($dir . '/' . hash('sha256', 'konta.md|' . $ip), 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        return null;
    }

    $recent = array_values(array_filter(
        array_map('intval', explode("\n", (string) stream_get_contents($handle))),
        static fn (int $at): bool => $at > $now - 3600
    ));
    $allowed = count($recent) < PER_HOUR;
    $recent[] = $now;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, implode("\n", array_slice($recent, -PER_HOUR)));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

/**
 * Puts the message into the onboarding pipeline. Best effort: any failure is swallowed, because
 * the mail has already gone and the visitor must not be told otherwise.
 *
 * @param array<string, string> $lead
 */
function forwardLead(array $lead, string $for): void
{
    $json = json_encode($lead, JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        return;
    }

    $headers = ['Content-Type: application/json', 'Accept: application/json'];

    // Signed over exactly the bytes posted, so the API checks what it received and nothing
    // re-encoded on the way. The timestamp lets it refuse a replay of an old lead.
    $key = leadKey();
    if ($key !== null) {
        $timestamp = (string) time();
        $headers[] = 'X-Konta-Lead-Timestamp: ' . $timestamp;
        $headers[] = 'X-Konta-Lead-For: ' . $for;
        $headers[] = 'X-Konta-Lead-Signature: ' . hash_hmac('sha256', $timestamp . "\n" . $for . "\n" . $json, $key);
    }

    if (function_exists('curl_init')) {
        $curl = curl_init(LEADS);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => LEAD_TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => LEAD_TIMEOUT_SECONDS,
        ]);
        @curl_exec($curl);
        curl_close($curl);

        return;
    }

    @file_get_contents(LEADS, false, stream_context_create(['http' => [
        'method' => 'POST',
        'header' => implode("\r\n", $headers) . "\r\n",
        'content' => $json,
        'timeout' => LEAD_TIMEOUT_SECONDS,
        'ignore_errors' => true,
    ]]));
}

function answer(string $outcome): never
{
    $wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
    $status = ['sent' => 200, 'incomplete' => 422, 'limited' => 429, 'failed' => 500, 'refused' => 403][$outcome] ?? 500;

    if ($wantsJson) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['outcome' => $outcome]);
        exit;
    }

    $fragment = ['sent' => 'trimis', 'incomplete' => 'incomplet', 'limited' => 'limitat'][$outcome] ?? 'eroare';
    header('Location: /contact/#' . $fragment, true, 303);
    exit;
}

/** One line, for a mail header: no CR or LF, so nobody can add a header of their own. */
function line(string $value, int $max): string
{
    $value = trim(preg_replace('/[\r\n\t]+/', ' ', $value) ?? '');

    return mb_substr($value, 0, $max);
}

function field(string $name): string
{
    $value = $_POST[$name] ?? '';

    return is_string($value) ? $value : '';
}

/** RFC 2047, without depending on mbstring's header functions being configured. */
function encodeHeader(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * The message laid out in Konta's mail template: the same layout as /root/agent/konta_email_template.html
 * and the app's invitation mail. Every value the visitor typed goes through e() first.
 */
function branded(
    string $name,
    string $company,
    string $email,
    string $phone,
    string $topic,
    string $language,
    string $received,
    string $message,
    string $subject
): string {
    $e = 'e'; // so the heredoc below can call it as {$e(...)}
    $font = "font-family:'IBM Plex Sans','Segoe UI',Helvetica,Arial,sans-serif;";
    $serif = "font-family:Georgia,'Times New Roman',serif;";

    $row = static function (string $label, string $value) use ($font): string {
        return '<tr>'
            . '<td valign="top" style="' . $font . ' padding:7px 16px 7px 0; font-size:13px; color:#857c8d; white-space:nowrap;">' . e($label) . '</td>'
            . '<td valign="top" style="' . $font . ' padding:7px 0; font-size:15px; color:#241b2e;">' . $value . '</td>'
            . '</tr>';
    };

    $link = static fn (string $href, string $text): string =>
        '<a href="' . e($href) . '" style="color:#3d2c4b;">' . e($text) . '</a>';

    $rows = $row('Nume', e($name))
        . $row('Firma', $company !== '' ? e($company) : '<span style="color:#857c8d;">nu a fost completată</span>')
        . $row('E-mail', $link('mailto:' . $email, $email))
        . $row('Telefon', $phone !== '' ? $link('tel:' . preg_replace('/[^0-9+]/', '', $phone), $phone) : '<span style="color:#857c8d;">nu a fost completat</span>')
        . $row('Subiect', e($topic))
        . $row('Limba', e($language))
        . $row('Primit', e($received));

    $reply = 'mailto:' . $email . '?subject=' . rawurlencode('Re: ' . $subject);
    $messageHtml = nl2br(e($message), false);

    return <<<HTML
<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{$e($subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#f6f4f7; -webkit-font-smoothing:antialiased;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">{$e($name)}: {$e(mb_substr($message, 0, 90))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f4f7;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <!--[if mso]><table role="presentation" width="760" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:760px; background-color:#ffffff; border:1px solid #e2dde6; border-radius:6px; overflow:hidden;">
          <tr>
            <td style="background-color:#3d2c4b; background-image:linear-gradient(135deg, #2c1f38 0%, #3d2c4b 55%, #4e3a5f 100%); padding:24px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" width="56" style="padding-right:14px;"><img src="https://konta.md/assets/logo-dark.png" width="46" height="34" alt="Konta" style="display:block; border:0;"></td>
                  <td align="left" valign="middle">
                    <div style="{$serif} font-size:24px; font-weight:600; color:#ffffff; line-height:1.15;">Konta</div>
                    <div style="{$font} font-size:12px; color:#d9c29a; padding-top:4px;">Formularul de contact de pe konta.md</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:3px; background-color:#a07f54; font-size:0; line-height:0;">&nbsp;</td></tr>
          <tr>
            <td style="padding:34px 36px 6px 36px;">
              <h1 style="margin:0 0 6px 0; {$serif} font-size:22px; line-height:1.35; font-weight:600; color:#241b2e;">Mesaj nou de la {$e($name)}</h1>
              <p style="margin:0 0 20px 0; {$font} font-size:14px; color:#5c5266;">Despre: {$e($topic)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">{$rows}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 36px 4px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f1e8; border-left:3px solid #a07f54; border-radius:3px;">
                <tr><td style="padding:16px 20px; {$font} font-size:15px; line-height:1.65; color:#241b2e;">{$messageHtml}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 30px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#3d2c4b; border-radius:3px;">
                    <a href="{$e($reply)}" style="display:inline-block; padding:13px 26px; {$font} font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:3px;">Răspunde lui {$e($name)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0; {$font} font-size:12px; line-height:1.6; color:#857c8d;">Sau apăsați „Răspunde” în programul de e-mail: răspunsul ajunge direct la {$e($email)}.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f1eef3; border-top:1px solid #e2dde6; padding:20px 36px; {$font} font-size:11px; line-height:1.7; color:#857c8d;">
              <strong style="color:#5c5266;">Konta</strong> &middot; contabilitate pentru companiile din Moldova<br>
              &copy; 2026 December Capital
            </td>
          </tr>
        </table>
      <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

// A form posted from somebody else's page is refused: the Origin has to be exactly ORIGIN. A
// missing Origin is refused as well. Every browser in use sends one on a POST, same-site or not,
// so a post without one did not come from the form on this site. Under
// PHP's built-in server (the local trial in docs/DEVELOPMENT.md) the page's own origin also
// passes; that server never runs on the host.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$local = PHP_SAPI === 'cli-server' && $origin === 'http://' . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== ORIGIN && !$local) {
    answer('refused');
}

// At most PER_HOUR attempts an hour from one address. Counted here, before the honeypot and the
// validation, so that whatever a sender does with the fields, every post costs it one.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$allowed = withinLimit($ip, time());
if ($allowed === null) {
    error_log('konta contact: cannot keep the throttle counter under konta-private/contact-throttle, refusing');
    answer('failed');
}
if ($allowed === false) {
    answer('limited');
}

// A bot fills every field. Tell it everything went well, and send nothing.
if (field('website') !== '') {
    answer('sent');
}

$name = line(field('name'), 120);
$company = line(field('company'), 160);
$email = line(field('email'), 200);
$phone = line(field('phone'), 40);
$topic = array_key_exists(field('topic'), TOPICS) ? field('topic') : 'other';
$lang = in_array(field('lang'), LANGS, true) ? field('lang') : 'ro';
$message = trim(mb_substr(str_replace("\r\n", "\n", field('message')), 0, 5000));

if ($name === '' || $message === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    answer('incomplete');
}

// "[konta.md] Ion Popescu from Contabil SRL on Demo", or without "from …" when no company was given.
$subject = sprintf(
    '[konta.md] %s%s on %s',
    $name,
    $company !== '' ? ' from ' . $company : '',
    SUBJECT_TOPICS[$topic]
);
$received = (new DateTimeImmutable('now', new DateTimeZone('Europe/Chisinau')))->format('d.m.Y, H:i');

$text = implode("\n", [
    'Mesaj nou din formularul de contact de pe konta.md.',
    '',
    'Nume:     ' . $name,
    'Firma:    ' . ($company !== '' ? $company : '-'),
    'E-mail:   ' . $email,
    'Telefon:  ' . ($phone !== '' ? $phone : '-'),
    'Subiect:  ' . TOPICS[$topic],
    'Limba:    ' . LANG_NAMES[$lang],
    'Primit:   ' . $received,
    '',
    $message,
    '',
    '-- ',
    'Răspundeți direct la acest mesaj: ajunge la ' . $email . '.',
    'Konta · konta.md',
]);

$html = branded($name, $company, $email, $phone, TOPICS[$topic], LANG_NAMES[$lang], $received, $message, $subject);

// multipart/alternative, both parts base64: UTF-8 survives every relay, and no line in the HTML
// can exceed the 998-character limit that some servers enforce by cutting it.
$boundary = 'konta-' . bin2hex(random_bytes(12));
$body = implode("\r\n", [
    'This is a multi-part message in MIME format.',
    '',
    '--' . $boundary,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    rtrim(chunk_split(base64_encode($text), 76, "\r\n")),
    '--' . $boundary,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    rtrim(chunk_split(base64_encode($html), 76, "\r\n")),
    '--' . $boundary . '--',
    '',
]);

$headers = implode("\r\n", [
    'From: ' . encodeHeader('Konta · formular') . ' <' . FROM . '>',
    'Reply-To: ' . encodeHeader($name) . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
]);

if (!mail(TO, encodeHeader($subject), $body, $headers, '-f' . FROM)) {
    answer('failed');
}

forwardLead([
    'name' => $name,
    'company' => $company,
    'email' => $email,
    'phone' => $phone,
    'topic' => $topic,
    'language' => $lang,
    'message' => $message,
], $ip);

answer('sent');
