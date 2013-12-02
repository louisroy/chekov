<?php
set_time_limit(60);

$filter_occurences = function($var) {
	if ($var >= 2) {
		return $var;
	}
	
	return false;
};

$collapse_xpath_attributes = function($value) {
	if (!empty($value[0])) {
		return (int)$value[0];
	}

	return $value;
};

include_once('uagent.php');

if (empty($_POST)) {
	$_POST['authenticity_token'] = 'lkmiXfMm+6KIyOcBXojI9BWLyEk+V57aU9Dv3QsRbHE=';
	$_POST['commit'] = 'Export';
	$_POST['format'] = 'osm';

	$_POST['maxlon'] = '-71.22261';
	$_POST['minlon'] = '-71.23308';

	$_POST['minlat'] = '44.80521';
	$_POST['maxlat'] = '46.81091';
}

$hash = md5(json_encode($_POST));
$xml_file = sprintf('data/%s.xml', $hash);
$json_file = sprintf('data/%s.json', $hash);

$ch = curl_init('http://www.openstreetmap.org/export/finish');

$user_agents = array(
	'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1667.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:25.0) Gecko/20100101 Firefox/25.0',
	'Mozilla/5.0 (compatible; MSIE 10.6; Windows NT 6.1; Trident/5.0; InfoPath.2; SLCC1; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729; .NET CLR 2.0.50727) 3gpp-gba UNTRUSTED/1.0',
	'Mozilla/5.0 (compatible; MSIE 10.6; Windows NT 6.1; Trident/5.0; InfoPath.2; SLCC1; .NET CLR 3.0.4506.2152; .NET CLR 3.5.30729; .NET CLR 2.0.50727) 3gpp-gba UNTRUSTED/1.0',
	'Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25',
	'Opera/9.80 (Windows NT 6.0) Presto/2.12.388 Version/12.14',
);

curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $_POST);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_VERBOSE, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_USERAGENT, $user_agents[array_rand($user_agents)]);

$response = curl_exec($ch);

$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$header = substr($response, 0, $header_size);
$body = substr($response, $header_size);

curl_close($ch);

file_put_contents($xml_file, $body);

$xml = simplexml_load_string($body);

$ways_filter = '/osm/way[not(tag[@k="building" or @k="building:part" or @k="amenity" or @k="historic" or @k="natural" or @k="waterway" or @k="leisure" or @k="bridge" or @k="railway" or @k="service" or @v="footway" or @v="industrial" or @v="recreation_ground" or @v="dyke" or @v="cycleway" or @v="pedestrian" or @v="track" or @v="grass" or @v="cemetery"])]';

// Exclude ways with buildings
$nodeIds = array_map($collapse_xpath_attributes, $xml->xpath($ways_filter . '/nd/@ref'));

$nodeIds = array_keys(array_filter(array_count_values($nodeIds), $filter_occurences));
$nodeIds = array_combine($nodeIds, $nodeIds);

$intersections = array();

foreach($xml->xpath('/osm/node') as $node) {
	$attributes = $node->attributes();
	
	if (isset($nodeIds[(string)$attributes->id])) {
		$ways = array_map($collapse_xpath_attributes, $xml->xpath($ways_filter . '/nd[@ref="' . (string)$attributes->id . '"]/parent::*/@id'));
		
		$intersections[] = array(
			'id' => (int)$attributes->id,
			'lat' => (float)$attributes->lat,
			'lng' => (float)$attributes->lon,
			'ways' => $ways
		);
	}
}

header('Content-type: application/json');

$json = json_encode($intersections);

file_put_contents($json_file, $json);

echo $json;