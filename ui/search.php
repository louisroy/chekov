<?php
set_time_limit(0);

if (empty($_POST)) {
	$_POST['maxlon'] = '-71.23830061769104';
	$_POST['minlon'] = '-71.24994140481567';

	$_POST['minlat'] = '46.80356166920837';
	$_POST['maxlat'] = '46.80981097146872';
}

$_POST['filename'] = md5(json_encode($_POST));

$python = (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') ? 'C:\Python33\python.exe' : '/usr/lib/python';
$script = '../chekov.py';

$arguments = array_map(function($value, $key) {
	return sprintf('--%s=%s', $key, $value);
}, $_POST, array_keys($_POST));

$command = sprintf('%s %s %s', $python, $script, implode(' ', $arguments));

exec($command, $output);

header('Content-type: application/json');
echo file_get_contents('../data/' . $_POST['filename'] . '.json');