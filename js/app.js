var App = (function () {

	var self = {};

	// UI containers
	var $map = null;
	var $console = null;
	var $search = null;

	// UI buttons
	var $searchBtn = null;
	var $clearBtn = null;
	var $exportBtn = null;

	// Google Maps API
	var map = null;
	var markers = [];
	var geocoder = null;
	var infoWindow = null;

	/**
	 * App constructor
	 */
	var construct = function () {
		google.maps.event.addDomListener(window, 'load', onAppReady);

		return self;
	};

	/**
	 * Triggered when the DOM is ready.
	 *
	 * @param {Object} ev Dom ready event object
	 */
	var onAppReady = function (ev) {
		console.log('App ready');

		// Cache UI containers
		$map = $('#map');
		$console = $('#console');
		$search = $('#search');

		// Cache UI buttons
		$clearBtn = $console.find('.btn-clear');
		$searchBtn = $console.find('.btn-search');
		$exportBtn = $console.find('.btn-export');

		// UI buttons events
		$clearBtn.on('click', onClearMap);
		$exportBtn.on('click', onExportMap);

		// Form events
		$console.on('submit', onConsoleSubmit);
		$search.on('submit', onSearchSubmit);

		$.ajax({
			url: 'https://ip.nf/me.json',
			dataType: 'json',
			success: function (data) {
				var mapOptions = {
					center: new google.maps.LatLng(data.ip.latitude, data.ip.longitude),
					zoom: 17,
					mapTypeId: google.maps.MapTypeId.ROADMAP
				};

				map = new google.maps.Map($map.get(0), mapOptions);

				geocoder = new google.maps.Geocoder();

				google.maps.event.addListener(map, 'center_changed', onMapChange);
				google.maps.event.addListener(map, 'zoom_changed', onMapChange);

				google.maps.event.addListenerOnce(map, 'idle', function () {
					google.maps.event.trigger(map, 'zoom_changed');
				});

				$console.trigger('submit');
			}
		});
	};

	/**
	 * Triggered when the export button is clicked.
	 *
	 * @param {Object} ev Submit event object
	 */
	var onExportMap = function (ev) {
		var $button = $(this);
		var exportList = [];

		// Loop and build array with lines for each intersection
		// {node_id},{connecting_node_id},{connecting_node_id},etc
		_.each(markers, function (marker, i, list) {
			exportList.push(marker.data.id + ',' + marker.data.adjacentNodes.join(','))
		});

		// base64 list
		var exportData = btoa(exportList.join("\r\n"));

		// Change href of button
		$button.attr('href', 'data:application/octet-stream;charset=utf-8;base64,' + exportData);
	};

	/**
	 * Clears map from all markers
	 *
	 * @param {Object} ev Submit event object
	 */
	var onClearMap = function (ev) {
		ev.preventDefault();

		_.each(markers, function (marker, i, list) {
			marker.setMap(null);
		});

		markers = [];

		$clearBtn.attr('disabled', true);
		$exportBtn.attr('disabled', true);
	};

	/**
	 * Triggered when the display button is clicked.
	 *
	 * @param {Object} ev Submit event object
	 */
	var onConsoleSubmit = function (ev) {
		ev.preventDefault();

		$clearBtn.trigger('click');

		var $form = $(this);

		$.ajax({
			url: $form.attr('action'),
			type: $form.attr('method'),
			data: {
				bbox: [$form.find('#minlon').val(), $form.find('#minlat').val(), $form.find('#maxlon').val(), $form.find('#maxlat').val()].join(',')
			},
			headers: {
				Accept: "text/xml; charset=utf-8",
				"Content-Type": "application/json; charset=utf-8"
			},
			dataType: 'json',
			dataFilter: cleanUpNodes,
			success: function (data) {
				$clearBtn.attr('disabled', false);
				$exportBtn.attr('disabled', false);

				onDataReceived(data);
			},
			complete: function () {
				$form.find(':input').attr('disabled', false);
			},
			error: function (request, error, message) {
				console.log(request, error, message);
			}
		});

		$form.find(':input').attr('disabled', true);
	};

	/**
	 * Filters data and transforms XML into JSON.
	 *
	 * @param {String} data Raw XML text
	 * @returns {String} Stringified JSON data
	 */
	var cleanUpNodes = function (data) {
		// Parse XML file
		var xml = $.parseXML(data);

		// XPath filters to remove unnecessary information
		var filters = [
			'@k="building"',
			'@k="building:part"',
			'@k="amenity"',
			'@k="historic"',
			'@k="natural"',
			'@k="waterway"',
			'@k="leisure"',
			'@k="bridge"',
			'@k="railway"',
			'@k="service"',

			'@v="footway"',
			'@v="industrial"',
			'@v="recreation_ground"',
			'@v="dyke"',
			'@v="cycleway"',
			'@v="pedestrian"',
			'@v="track"',
			'@v="grass"',
			'@v="cemetery"'
		];

		console.log("XML has " + xml.evaluate('count(//*)', xml, null, XPathResult.NUMBER_TYPE, null).numberValue + " elements.");

		var badNodes = xml.evaluate('/osm/way[tag[' + filters.join(' or ') + ']] | //tag | /osm/relation | /osm/bounds', xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

		// Clean up to speed up, mothertrucker!
		var deleted = 0;
		for (var i = 0; i < badNodes.snapshotLength; i++) {
			var node = badNodes.snapshotItem(i);
			node.parentNode.removeChild(node);
		}

		console.log("After clean up, XML has " + xml.evaluate('count(//*)', xml, null, XPathResult.NUMBER_TYPE, null).numberValue + " elements.");

		var repeatedRefs = findIntersections(xml);

		return prepareData(repeatedRefs, xml);
	};

	var findIntersections = function(xml) {
		// Node references, convert to integers
		var refNodes = xml.evaluate('/osm/way/nd/@ref', xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
		var refs = xmlMapToArray(refNodes, parseInt);

		console.log("Found " + refs.length + " node references.");

		var sortedRefs = refs.sort();
		var repeatedRefs = [];

		for (var j = 0; j < refs.length - 1; j++) {
			if (sortedRefs[j + 1] == sortedRefs[j]) {
				repeatedRefs.push(sortedRefs[j]);
			}
		}
		
		// Unique node IDs
		repeatedRefs = _.uniq(repeatedRefs);
		
		console.log("Found " + repeatedRefs.length + " intersections.");

		return repeatedRefs;
	};


	var prepareData = function(repeatedRefs, xml) {
		var intersections = [];

		for (var k in repeatedRefs) {
			var nodeId = repeatedRefs[k];
			var currentNode = xml.evaluate(
				'/osm/node[@id="' + nodeId + '"]',
				xml,
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			);

			// TODO : Adjacent nodes are still missing in some places

			var adjacentNodes = xml.evaluate(
				'/osm/way/nd[@ref="' + nodeId + '"]/following-sibling::nd[1]/@ref | /osm/way/nd[@ref="' + nodeId + '"]/preceding-sibling::nd[1]/@ref',
				xml,
				null,
				XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
				null
			);

			// Unique adjacent nodes IDs
			var adjacents = _.uniq(xmlMapToArray(adjacentNodes, parseInt));

			// Build description user in the InfoBox
			var description = [];
				description.push('<strong>' + nodeId + '</strong>');
				description.push('Adjacent nodes:');
				description.push(adjacents.join(', '));
				description.push('XML: ');
				description.push($('<div />').text(new XMLSerializer().serializeToString(currentNode.singleNodeValue)).html());

			var intersection = {
				id: nodeId,
				description: '<div style="width:200px;">' + description.join('<br />') + '</div>',
				lat: parseFloat(currentNode.singleNodeValue.attributes.getNamedItem('lat').value),
				lng: parseFloat(currentNode.singleNodeValue.attributes.getNamedItem('lon').value),
				adjacentNodes: adjacents
			};

			intersections.push(intersection);
		}

		return JSON.stringify(intersections);

		/*
		 var running = 0;

		 for (var k in repeatedRefs) {
		 var worker = new Worker("/js/worker.js");
		 worker.onmessage = function() {
		 --running;

		 console.log('Worker is done');

		 if (running === 0) {
		 console.log('All workers done')
		 }
		 };
		 worker.postMessage({nodeId:repeatedRefs[k], xml:xml.toString()});

		 ++running;
		 }

		 */
	};

	/**
	 * Triggered when data is received from the AJAX call.
	 *
	 * @param {Object} data Data containing nodes and adjacent nodes
	 */
	var onDataReceived = function (data) {
		// Loop through intersections to display markers
		_.each(data, function (intersection, i, list) {
			// Create marker
			var marker = new google.maps.Marker({
				position: new google.maps.LatLng(intersection.lat, intersection.lng),
				map: map,
				title: intersection.id.toString(),
				data: intersection,
				icon: createMarker()
			});

			google.maps.event.addListener(marker, 'click', onMarkerClick);

			// Store marker in array
			markers.push(marker);
		});
	};

	/**
	 * Triggered when the map is changed (zoom or pan).
	 *
	 * @param {Object} ev Map change event object
	 */
	var onMapChange = function (ev) {
		// Get bounds
		var bounds = map.getBounds();

		// Change bounds
		$console.find('input#maxlon').val(map.getBounds().getNorthEast().lng());
		$console.find('input#minlon').val(map.getBounds().getSouthWest().lng());
		$console.find('input#maxlat').val(map.getBounds().getNorthEast().lat());
		$console.find('input#minlat').val(map.getBounds().getSouthWest().lat());
	};

	/**
	 * Triggered when the search form is submitted.
	 *
	 * @param {Object} ev Submit event object
	 */
	var onSearchSubmit = function (ev) {
		ev.preventDefault();

		var $form = $(this);
		var query = $form.find('input:first').val();

		$form.find(':input').attr('disabled', true);

		geocoder.geocode({'address': query}, function (results, status) {
			$form.find(':input').attr('disabled', false);

			if (status == google.maps.GeocoderStatus.OK) {
				map.setCenter(results[0].geometry.location);
			}
		});
	};

	/**
	 * Returns all the markers in a way.
	 *
	 * @param {Number} wayId ID of way
	 * @param {Array} excludeNodeId List of excluded node IDs
	 * @returns {Array} Marker in way
	 */
	var findMarkersInWay = function (wayId, excludeNodeId) {
		var markersInWay = [];

		for (var i = 0; i < markers.length; i++) {
			var marker = markers[i];

			if (marker.data.id === excludeNodeId) {
				continue;
			}

			if ($.inArray(wayId, marker.data.ways) !== -1) {
				markersInWay.push(marker);
			}
		}

		return markersInWay;
	};

	/**
	 * Returns a specific marker based on it's node ID.
	 *
	 * @param {Number} nodeId
	 * @returns {Number|Null} Google Maps marker or nothing
	 */
	var findMarkerById = function (nodeId) {
		for (var i = 0; i < markers.length; i++) {
			if (markers[i].data.id === nodeId) {
				return markers[i];
			}
		}

		return null;
	};

	/**
	 * Resets all the markers to their original look.
	 */
	var resetMarkers = function () {
		for (var i = 0; i < markers.length; i++) {
			markers[i].setIcon(createMarker());
		}
	};

	/**
	 * Triggered when a marker is clicked
	 *
	 * @param {Object} ev Click event object
	 * @param {Object} marker Marker that was clicked
	 */
	var onMarkerClick = function (ev, marker) {
		resetMarkers();

		var currentMarker = this;

		/*
		 var markersInWay = [];

		 for (var i = 0; i < this.data.ways.length; i++) {
		 $.merge(markersInWay, findMarkersInWay(this.data.ways[i], currentMarker.data.id));
		 }

		 for (var i = 0; i < markersInWay.length; i++) {
		 markersInWay[i].setIcon(createMarker('FFFFFF'));
		 }
		 */

		for (var i = 0; i < this.data.adjacentNodes.length; i++) {
			var adjacentMarker = findMarkerById(this.data.adjacentNodes[i]);

			if (adjacentMarker) {
				adjacentMarker.setIcon(createMarker('000000'));
			}
		}

		// Identify current clicked marker
		currentMarker.setIcon(createMarker('00FF00'));

		if (infoWindow) {
			infoWindow.close();
			infoWindow = null;
		}

		infoWindow = new google.maps.InfoWindow({
			content: currentMarker.data.description
		});

		// infoWindow.open(map, currentMarker);
	};

	/**
	 * Creates a marker
	 *
	 * @param {String} color Hexadecimal color
	 * @returns {Object} Google Maps marker
	 */
	var createMarker = function (color) {
		var image = '//maps.google.com/mapfiles/kml/pal4/icon57.png';
		
		if (color === '000000') {
			image = '//maps.google.com/mapfiles/kml/pal4/icon49.png';
		} else if (color === '00FF00') {
			image = '//maps.google.com/mapfiles/kml/pal4/icon58.png';
		}
		
		return new google.maps.MarkerImage(
			image,
			new google.maps.Size(32, 32),
			new google.maps.Point(0, 0),
			new google.maps.Point(16, 16)
		);
	};

	return construct();
})();
