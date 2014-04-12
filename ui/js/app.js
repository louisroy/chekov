var App = (function () {

	var $map = null;
	var $console = null;
	var $search = null;

	var map = null;
	var markers = [];
	var geocoder = null;
	var infowindow = null;

	var $searchBtn = null;
	var $clearBtn = null;
	var $exportBtn = null;

	$.fn.getAttributes = function () {
		var attributes = {};

		if (this.length) {
			$.each(this[0].attributes, function (index, attr) {
				attributes[ attr.name ] = attr.value;
			});
		}

		return attributes;
	};

	var onAppReady = function (ev) {
		console.log('App ready');

		$map = $('#map');
		$console = $('#console');
		$search = $('#search');

		$clearBtn = $console.find('button.btn-clear');
		$searchBtn = $console.find('button.btn-search');
		$exportBtn = $console.find('button.btn-export');

		$clearBtn.on('click', onClearMap);
		$clearBtn.on('click', onExportMap);

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
	}

	var onExportMap = function (ev) {
		ev.preventDefault();

	}

	var onClearMap = function (ev) {
		ev.preventDefault();

		$.each(markers, function (i, marker) {
			marker.setMap(null);
		});

		markers = [];

		$clearBtn.attr('disabled', true);
		$exportBtn.attr('disabled', true);
	}

	var onConsoleSubmit = function (ev) {
		ev.preventDefault();

		$clearBtn.trigger('click');

		var $form = $(this);

		$.ajax({
			url: $form.attr('action'),
			type: $form.attr('method'),
			data: $form.serializeArray(),
			dataType: 'json',
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
	}

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
	}

	var onMapChange = function (ev) {
		// Get bounds
		var bounds = map.getBounds();

		// Change bounds
		$console.find('input#maxlon').val(map.getBounds().getNorthEast().lng());
		$console.find('input#minlon').val(map.getBounds().getSouthWest().lng());
		$console.find('input#maxlat').val(map.getBounds().getNorthEast().lat());
		$console.find('input#minlat').val(map.getBounds().getSouthWest().lat());
	}

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
	}
	
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
	}
	
	var findMarkerById = function(nodeId) {
		for (var i = 0; i < markers.length; i++) {
			if (markers[i].data.id === nodeId) {
				return markers[i];
			}
		}
		
		return null;
	}
		
	var resetMarkers = function() {
		for (var i = 0; i < markers.length; i++) {
			markers[i].setIcon(createMarker());
		}
	}

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
				adjacentMarker.setIcon(createMarker('red'));
			}
		}
		
		// Identify current clicked marker
		currentMarker.setIcon(createMarker('redstar'));

		showInfoWindow(currentMarker);
	}
	
	var createMarker = function(type) {
		switch(type) {
			case 'red' :
				url = "http://maps.google.com/mapfiles/kml/pal4/icon49.png";
				break;
			case 'black' :
				url = "http://maps.google.com/mapfiles/kml/pal4/icon57.png";
				break;
			case 'redstar' :
				url = "http://maps.google.com/mapfiles/kml/pal4/icon51.png";
				break;
			case 'blackstar' :
				url = "http://maps.google.com/mapfiles/kml/pal4/icon59.png";
				break;
			default :
				url = "http://maps.google.com/mapfiles/kml/pal4/icon57.png";
				break;
		}
		
		return new google.maps.MarkerImage(url,
		        new google.maps.Size(32, 32),
		        new google.maps.Point(0,0),
		        new google.maps.Point(15, 17));
	}
	
	var showInfoWindow = function(marker) {
		if (infowindow) {
			infowindow.close();
		}
		
		infowindow = new google.maps.InfoWindow(marker.data);
		
		infowindow.open(map, marker);
	}

	var construct = (function () {
		google.maps.event.addDomListener(window, 'load', onAppReady);
	})();

})();