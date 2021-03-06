/*
	Module for logged user profile

	//TODO extend by K.User	
*/

Kepler.Profile = {

	ready: false,

	id: null,
	user: null,
	data: {},
	placeCheckin: null,

	_deps: {
		online: new Tracker.Dependency()
	},

	init: function(cb) {

		var self = this;

		if(self.ready)
			return self;
		else
			self.ready = true;

		Tracker.autorun(function() {

			self.id = Meteor.userId();
			self.data = Meteor.user();
		
			if(!self.data)	//onlogout
				return self.ready = false;

			self.user = K.userById(self.id);

			if(self.data.checkin)
				self.placeCheckin = K.placeById(self.data.checkin);
		
			if(self.data.status==='online' || self.data.status==='away')
				Meteor.subscribe('friendsByIds', K.Profile.data.friends, function() {
					_.map(K.Profile.data.friends, function(id) {
						K.Map.addItem(K.userById(id));
					});
				});
			else
				_.map(K.Profile.data.friends, function(id) {
					K.Map.removeItem(K.userById(id));
				});
		
		});

		if(self.data.mob !== K.Util.isMobile()) {
			Users.update(Meteor.userId(), {
				$set: {mob: K.Util.isMobile() }
			});
		}	

		if(_.isFunction(cb))
			cb.call(self, self.data);

		return this;
	},
	getOnline: function() {
		var self = this;
		this._deps.online.depend();
		//TODO var mstatus = Meteor.status(); mstatus.connected &&
		return (self.data.status==='online' || self.data.status==='away');
	},	
	setOnline: function(online) {
		var self = this;
		Meteor.call('UserPresence:setDefaultStatus', online?'online':'offline', function(err, data) {
			self._deps.online.changed();
		});
		return this;
	},
	setLoc: function(loc) {
		var self = this;
		Meteor.call('setLoc', loc, function(err) {
			self.user.update();
			if(self.user && self.user.icon)
				self.user.icon.animate();
		});
		return this;
	},	
	getOpts: function(prop) {
		return K.Util.getPath(this.data,'settings.'+prop);
	},
	hasFriend: function(userId) {
		return _.contains(this.data.friends, userId);
	},
	hasPending: function(userId) {
		return _.contains(this.data.usersPending, userId);
	},
	hasReceive: function(userId) {	
		return _.contains(this.data.usersReceive, userId);
	},
	hasBlocked: function(userId) {
		return _.contains(this.data.usersBlocked, userId);
	},
	friendAdd: function(userId) {
		Meteor.call('friendAdd', userId);
		return this;
	},
	friendConfirm: function(userId) {
		Meteor.call('friendConfirm', userId);
		return this;
	},	
	friendDel: function(userId) {
		Meteor.call('friendDel', userId);
		return this;
	},
	userBlock: function(userId) {
		Meteor.call('userBlock', userId);
		return this;
	},
	userUnblock: function(userId) {
		Meteor.call('userUnblock', userId);
		return this;
	},	
	addCheckin: function(placeId) {
		var self = this;
		Meteor.call('addCheckin', placeId, function() {
			self.placeCheckin = K.placeById(placeId);
			self.user.update();
		});
		return this;
	},
	removeCheckin: function(placeId) {
		var self = this;
		Meteor.call('removeCheckin', placeId, function(err) {
			self.placeCheckin = null;

			//TODO don't use update to force reativity
			self.user.update();
		});
		return this;
	},
	logout: function() {
		this.setOnline(false);
		this.ready = false;
		Meteor.logout();
		return this;
	}
};
