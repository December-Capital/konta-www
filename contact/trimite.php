<?php
/*
 * The contact form on konta.md/contact/. Receives one message and mails it to mail@konta.md.
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
 */

declare(strict_types=1);

const TO = 'mail@konta.md';
const FROM = 'mail@konta.md';
const PER_HOUR = 5;
const TOPICS = ['demo' => 'Demo', 'partner' => 'Parteneriat', 'efactura' => 'e-Factura', 'other' => 'Altceva'];
const LANGS = ['ro', 'ru', 'en'];

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

$subject = sprintf('[konta.md] %s: %s%s', TOPICS[$topic], $name, $company !== '' ? ' (' . $company . ')' : '');

$body = implode("\n", [
    'Mesaj nou din formularul de contact de pe konta.md.',
    '',
    'Nume:     ' . $name,
    'Firma:    ' . ($company !== '' ? $company : '-'),
    'E-mail:   ' . $email,
    'Telefon:  ' . ($phone !== '' ? $phone : '-'),
    'Subiect:  ' . TOPICS[$topic],
    'Limba:    ' . $lang,
    '',
    $message,
    '',
    '-- ',
    'Răspundeți direct la acest mesaj: ajunge la ' . $email . '.',
]);

$headers = implode("\r\n", [
    'From: ' . encodeHeader('Konta · formular') . ' <' . FROM . '>',
    'Reply-To: ' . encodeHeader($name) . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
]);

if (!mail(TO, encodeHeader($subject), $body, $headers, '-f' . FROM)) {
    answer('failed');
}

$recent[] = $now;
@file_put_contents($ledger, implode("\n", $recent), LOCK_EX);

answer('sent');
