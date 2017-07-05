/*
	module for main map
*/
var layers = {},
	controls = {},
	styles = {
		def: {		//default geojson style
			color: '#b6f', weight: 5, opacity:0.7
		},
		access: {	//tracks
			color: '#66f', weight: 8, opacity: 0.7
		},
		placeCircle: {	//circle around place
			color: '#f33', weight: 4, opacity: 0.7, radius: 15,
		},	
		poiLine: {	//line from place to pois
			color: '#f33', weight: 4, opacity: 0.7, dashArray: '1,6'
		}
	};

layers.baselayer = new L.TileLayer(' ');

layers.users = new L.LayerGroup();

layers.cluster = new L.MarkerClusterGroup({
	spiderfyDistanceMultiplier: 1.4,
	showCoverageOnHover: false,
	maxClusterRadius: 40,
	iconCreateFunction: function(cluster) {
		if(!cluster.$icon)
			cluster.$icon = L.DomUtil.create('div');

		cluster.checkinsCount = function() {
			var places = _.map(cluster.getAllChildMarkers(), function(marker) {
				return marker.item.id;
			});
			return K.findCheckinsCountByPlaces(places);
		};
		
		if(!cluster.icon) {
			Blaze.renderWithData(Template.item_place_cluster, cluster, cluster.$icon);
			cluster.icon = new L.NodeIcon({
				className: 'marker-cluster',
				nodeHtml: cluster.$icon
			});
		}

		return cluster.icon;
	}
});

layers.places = new L.LayerJSON({
	caching: false,
	layerTarget: layers.cluster,
	minShift: Meteor.settings.public.bboxMinShift,
	callData: function(bbox, callback) {

		var sub = Meteor.subscribe('placesByBBox', bbox, function() {

			callback( K.findPlacesByBBox(bbox).fetch() );
		});

		return {
			abort: sub.stop
		};
	},
	dataToMarker: function(data) {	//eseguito una sola volta per ogni place
		return K.newPlace(data._id).marker;
	}
});

layers.geojson = new L.GeoJSON(null, {
	//autoclear: false,
	style: function (feature) {
		return styles[feature.properties.type || 'def'] || styles.def;
	},
	pointToLayer: function(feature, latlng) {	//costruisce marker POI

		if(feature.properties.type==='placeCircle')	//evidenzia place nei pois
			return new L.CircleMarker(latlng);
		else
		{
			var iconPoi = L.DomUtil.create('div');
			L.DomUtil.create('i', 'icon icon-'+feature.properties.type, iconPoi);
			return new L.Marker(latlng, {
					icon: new L.NodeIcon({className:'marker-poi', nodeHtml: iconPoi})
				});
		}
	},
	onEachFeature: function (feature, layer) {
		var tmpl, $popup;

		if(feature.geometry.type==='LineString')
			tmpl = Template.popupTrack;

		else if(feature.geometry.type==='Point')
			tmpl = Template.popupPoi;

		if(tmpl && feature.properties) {
			$popup = L.DomUtil.create('div','');
			Blaze.renderWithData(tmpl, feature.properties.tags || feature.properties, $popup);
			layer.bindPopup($popup, {closeButton:false} );
		}
	}
});
////LAYERS/

controls.zoom = L.control.zoom({
	position: 'topright',
	zoomOutText: '',
	zoomInText: ''	
});

controls.attrib = L.control.attribution({
	position: 'bottomright',
	prefix: i18n('website.copy')+' &bull; '+i18n('controls.attrib')
});

controls.gps = L.control.gps({
	position: 'bottomright',
	title: i18n('controls.gps.title'),
	textErr: null,//i18n('controls.gps.error'),
	marker: new L.Marker([0,0], {
		icon: L.divIcon({className: 'marker-gps'})
	}),
	callErr: function(err) {
		K.Notif.show(err,'warn');
	}
})
.on({
	gpsdisabled: function(e) {
		K.Profile.setLoc(null);
	},
	gpslocated: function(e) {
		K.Profile.setLoc([e.latlng.lat, e.latlng.lng]);
		if(K.Profile.user && K.Profile.user.icon)
			K.Profile.user.icon.animate();
		K.Notif.show(i18n('notifs.gpson'),'success');		
	}
});

Kepler.Map = {

	ready: false,

	_map: null,

	_deps: {
		bbox: new Tracker.Dependency()
	},

	init: function(opts, cb) {		//render map and add controls/layers

		var self = this;

		if(self.ready || $('#map').length===0) return this;

		self.ready = true;

		self._map = new L.Map('map', {		
			attributionControl: false,
			zoomControl: false			
		})
		.on('moveend zoomend', function(e) {
			self._deps.bbox.changed();

			//autoclean geojson layer
			if(layers.geojson.getLayers().length) {
				if(e.target.getBoundsZoom(layers.geojson.getBounds()) - e.target.getZoom() > 2)
					layers.geojson.clearLayers();
			}
		});

		self.sidebar$ = $('#sidebar');

		self._addControls();

		self.setOpts(opts);

		//Fix only for Safari event resize! when shift to fullscreen
		$(window).on('orientationchange'+(K.Util.isMobile()?'':' resize'), _.debounce(function(e) {

			$(window).scrollTop(0);
			//console.log('invalidateSize', (new Date).getTime(), self._map.getSize() )
			self._map.invalidateSize(false);

		}, Meteor.settings.public.typeDelay+1000) );

		if(_.isFunction(cb))
			self._map.whenReady(function() {
				self._deps.bbox.changed();
				cb.call(self);
			}, self);

		return this;
	},

	_addControls: function() {
		_.invoke([
			layers.baselayer,
			controls.attrib,
			controls.zoom,			
			controls.gps,
			layers.geojson,
			layers.users
		],'addTo', this._map);
	},
	
	_setView: function(loc, zoom) {
		if(this.ready) {
			this._map.setView(loc, zoom);
			/*TODO 
			if(this.sidebar$.hasClass('expanded')) {
				var p = this._map.latLngToContainerPoint(L.latLng(loc));
				p = L.point(p.x - sidebar$.width(), p.y);
				loc = this._map.containerPointToLatLng(p);
			}
			this._map.setView(loc, zoom);
			//*/
		}
		return this;
	},

	isVisible: function() {
		if(!this.ready) return false;

		var mapw = this._map.getSize().x,
			panelw = (this.sidebar$.hasClass('expanded') && this.sidebar$.width()) || 0;

		return this.ready && (mapw-panelw > 40);
	},

	setOpts: function(opts) {
		if(this.ready) {
			opts = _.extend({}, Meteor.settings.public.map, opts);

			if(!K.Util.valid.loc(opts.center))
				opts.center = Meteor.settings.public.map.center;
			
			if(!Meteor.settings.public.layers[opts.layer])
				opts.layer = Meteor.settings.public.map.layer;

			this._setView(opts.center, opts.zoom);

			layers.baselayer.setUrl( Meteor.settings.public.layers[opts.layer] );
		}
		return this;
	},

	destroy: function() {
		if(this.ready) {
			this.ready = false;
			layers.places.clearLayers();			
			layers.cluster.clearLayers();
			this._map.remove();			
		}
		return this;
	},
	
	enableBBox: function() {
		if(this.ready) {
			this._map.addLayer(layers.cluster);
			this._map.addLayer(layers.places);
		}
		return this;
	},
	disableBBox: function() {
		if(this.ready) {
			this._map.removeLayer(layers.places);
			this._map.removeLayer(layers.cluster);
		}
		return this;
	},

	getCenter: function() {
		var ll = this._map.getCenter();
		return [ll.lat, ll.lng];
	},

	getBBox: function() {
		if(this.ready) {
			this._deps.bbox.depend();

			var bbox = this._map.getBounds(),
				sw = bbox.getSouthWest(),
				ne = bbox.getNorthEast();

			if(this.sidebar$.hasClass('expanded')) {
				var p = this._map.latLngToContainerPoint(sw);
				p.x += this.sidebar$.width();
				sw = this._map.containerPointToLatLng(p);
			}

			return K.Util.geo.roundBbox([[sw.lat, sw.lng], [ne.lat, ne.lng]]);
		}
	},
	
	loadLoc: function(loc, cb) {
		if(this.ready) {
			if(_.isFunction(cb))
				this._map.once("moveend zoomend", cb);
			
			if(loc && K.Util.valid.loc(loc))
				this._setView( L.latLng(loc) , Meteor.settings.public.loadLocZoom);
		}
		return this;
	},

	addItem: function(item) {
		if(this.ready) {

			if(item.type==='place')
				item.marker.addTo( layers.places );

			else if(item.type==='user')
				item.marker.addTo( layers.users );
		}
		return this;
	},

	removeItem: function(item) {
		if(this.ready) {
			if(item && item.marker)
				this._map.removeLayer(item.marker);
		}
		return this;
	},

	loadGeojson: function(geoData, cb) {
		if(this.ready) {
			geoData = _.isArray(geoData) ? geoData : [geoData];

			this._map.closePopup();

			layers.geojson.clearLayers();
			
			for(var i in geoData) {
				if(geoData[i] && (geoData[i].features || geoData[i].feature))
					layers.geojson.addData(geoData[i]);
			}

			var bb = layers.geojson.getBounds(),
				zoom = this._map.getBoundsZoom(bb),
				loc = bb.getCenter();

			if(_.isFunction(cb))
				this._map.once("moveend zoomend", cb);
			
			this._setView(loc, zoom);
		}
		return this;
	}
};
