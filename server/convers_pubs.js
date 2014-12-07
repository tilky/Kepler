
Meteor.publish('conversByIds', function(convIds) {

	console.log('Pub: conversByIds', convIds);

	if(this.userId && convIds)
	{
		var conversCur = getConversByIds(convIds),
			conversData = conversCur.fetch(),
			usersIds = _.uniq(_.flatten( _.pluck(conversData, 'usersIds') ));
			//TODO estrarre solo gli ultimi 3-4

		return [
			conversCur,
			getUsersByIds( _.last(usersIds,3) )
		];
	}
	else
		this.ready();	
});

Meteor.publish('converById', function(convId) {

	if(this.userId && convId)
	{
		console.log('Pub: converById', convId);

		var convCur = getConverById(convId),
			convData = convCur.fetch()[0],
			retCurs = [];
		
		retCurs.push( convCur );

		retCurs.push( getMsgsByConver(convId) );

		retCurs.push( getUsersByIds(convData.usersIds) );

		return retCurs;
	}
	else
		this.ready();	
});
