<?php
/*
 * The contact form on konta.md/contact/. Receives one message and mails it to mail@konta.md, in
 * Konta's branded layout with a plain-text part beside it. Subject: "[konta.md] <Name> from
 * <Company> on <Topic>".
 *
 * It runs on the static host, so it holds no secret: it sends through the host's own mail(),
 * which Hostinger delivers for the domain's own addresses, and the SPF record already covers.
 * If PHP were ever switched off and this file served as text, nothing would leak.
 *
 * Answers JSON to the page's script (Accept: application/json) and a 303 back to the form to a
 * browser without JavaScript, landing on the matching message through the URL fragment.
 *
 * Spam: a honeypot field real people never see, length limits, a same-site Origin check, and at
 * most five messages an hour from one address. No captcha: the site promises the browser talks to
 * nobody but konta.md.
 *
 * Each message also becomes a lead in the operator console's onboarding pipeline, posted from
 * here (the server, not the browser) to app.konta.md/api/v1/leads. That door holds no secret
 * either, for the same reason this file holds none: it is exactly as open as this form already
 * is. A pipeline that is down or slow never costs the visitor their message: the mail is what
 * counts, and the lead is best effort with a short timeout.
 */

declare(strict_types=1);

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

/**
 * Puts the message into the onboarding pipeline. Best effort: any failure is swallowed, because
 * the mail has already gone and the visitor must not be told otherwise.
 *
 * @param array<string, string> $lead
 */
function forwardLead(array $lead): void
{
    $json = json_encode($lead, JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        return;
    }

    if (function_exists('curl_init')) {
        $curl = curl_init(LEADS);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
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
        'header' => "Content-Type: application/json\r\nAccept: application/json\r\n",
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

// A form posted from somebody else's page is refused: the Origin has to name the host that served
// this script. A missing Origin is allowed, since some older browsers omit it and the other checks
// still apply.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && strtolower((string) parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '')) !== $host) {
    answer('refused');
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

// At most PER_HOUR messages an hour from one address, counted in a file per hashed address.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$ledger = sys_get_temp_dir() . '/konta-contact-' . hash('sha256', 'konta.md|' . $ip);
$now = time();
$recent = [];
if (is_readable($ledger)) {
    $recent = array_filter(
        array_map('intval', explode("\n", (string) file_get_contents($ledger))),
        static fn (int $at): bool => $at > $now - 3600
    );
}
if (count($recent) >= PER_HOUR) {
    answer('limited');
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

$recent[] = $now;
@file_put_contents($ledger, implode("\n", $recent), LOCK_EX);

forwardLead([
    'name' => $name,
    'company' => $company,
    'email' => $email,
    'phone' => $phone,
    'topic' => $topic,
    'language' => $lang,
    'message' => $message,
]);

answer('sent');
