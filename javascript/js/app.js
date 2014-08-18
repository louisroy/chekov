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
		
		var mapOptions = {
			center: new google.maps.LatLng(46.8032826, -71.242796),
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
		$.each(markers, function(i, marker) {
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

		$.each(markers, function (i, marker) {
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
				bbox:[$form.find('#minlon').val(), $form.find('#minlat').val(), $form.find('#maxlon').val(), $form.find('#maxlat').val()].join(',')
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
	var cleanUpNodes = function(data) {
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
			'@v="cemetery"',
		];
		
		console.log("XML has " + xml.evaluate('count(//*)', xml, null, XPathResult.NUMBER_TYPE, null).numberValue + " elements.");
		
		var badNodes = xml.evaluate('/osm/way[tag[' + filters.join(' or ') + ']] | //tag | /osm/relation | /osm/bounds', xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
		
		// Clean up to speed up, mothertrucker!
		deleted = 0;
		for (var i = 0 ; i < badNodes.snapshotLength; i++) {
			var node = badNodes.snapshotItem(i);
			node.parentNode.removeChild(node);
		}
		
		console.log("After clean up, XML has " + xml.evaluate('count(//*)', xml, null, XPathResult.NUMBER_TYPE, null).numberValue + " elements.");
		
		// Node references, convert to integers
		var refNodes = xml.evaluate('/osm/way/nd/@ref', xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
		var refs = xmlMapToArray(refNodes, parseInt);
		
		console.log("Found " + refs.length + " node references.");
		
		var sortedRefs = refs.sort();
		var repeatedRefs = [];
		
		for (var i = 0; i < refs.length - 1; i++) {
			if (sortedRefs[i + 1] == sortedRefs[i]) {
				repeatedRefs.push(sortedRefs[i]);
			}
		}
		
		console.log("Found " + repeatedRefs.length + " intersections.");
		
		var intersections = [];
		
		for (var i in repeatedRefs) {
			var nodeId = repeatedRefs[i];
			var node = xml.evaluate('/osm/node[@id="' + nodeId + '"]', xml, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			
			var adjacentNodes = xml.evaluate('/osm/way/nd[@ref="' + nodeId + '"]/following-sibling::nd[1]/@ref | /osm/way/nd[@ref="' + nodeId + '"]/preceding-sibling::nd[1]/@ref', xml, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
			var adjacents = xmlMapToArray(adjacentNodes, parseInt);
			
			var intersection = {
				id: nodeId,
				lat: parseFloat(node.singleNodeValue.attributes.getNamedItem('lat').value),
				lng: parseFloat(node.singleNodeValue.attributes.getNamedItem('lon').value),
				adjacentNodes: adjacents
			};
			
			intersections.push(intersection);
		}
		
		return JSON.stringify(intersections);
	}
	
	var xmlMapToArray = function(xml, func) {
		var arr = [];
		
		for (var i = 0 ; i < xml.snapshotLength; i++) {
			arr.push(func(xml.snapshotItem(i).nodeValue));
		}
		
		return arr;
	}
	
	/**
	 * Triggered when data is received from the AJAX call.
	 * 
	 * @param {Object} data Data containing nodes and adjacent nodes
	 */
	var onDataReceived = function (data) {
		// Loop through intersections to display markers
		$.each(data, function (i, intersection) {
			// Create marker
			var marker = new google.maps.Marker({
				position: new google.maps.LatLng(intersection.lat, intersection.lng),
				map: map,
				title: intersection.id.toString(),
				data: intersection,
				icon:createMarker()
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
	 * @param {Number} waydId ID of way
	 * @param {Array} excludeNodeId List of excluded node IDs
	 * @returns 
	 */
	var findMarkersInWay = function(wayId, excludeNodeId) {
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
	var findMarkerById = function(nodeId) {
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
	var resetMarkers = function() {
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
	};
	
	/**
	 * Creates a marker
	 * 
	 * @param {String} color Hexadecimal color
	 * @returns {MarkerImage} Google Maps marker
	 */
	var createMarker = function(color) {
		return new google.maps.MarkerImage(
			"http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|" + (color || 'FE7569'),
			new google.maps.Size(21, 34),
			new google.maps.Point(0,0),
			new google.maps.Point(10, 34)
		);
	};
	
	/**
	 * App constructor
	 */
	var construct = (function () {
		google.maps.event.addDomListener(window, 'load', onAppReady);
	})();
	
	return self;
})();

$.fn.serializeObject = function()
{
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name] !== undefined) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};