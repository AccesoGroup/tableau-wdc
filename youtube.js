(function() {
var config = {
	clientId: '949846984655-hhc50dccduk7i0ctfus7q17p0g1km5oe.apps.googleusercontent.com',
	//redirectUri: 'http://localhost:8888/wdc/youtube.html',
	redirectUri: 'http://accesogroup.github.io/tableau-wdc/youtube.html',
	scopes: ['https://www.googleapis.com/auth/yt-analytics.readonly', 'https://www.googleapis.com/auth/youtube.readonly'],
	checkInterval: 1000
};

var asyncChecker;
var hasMore, lastRecordToken, connectionData;

var videosRecovered = false;
var totalNumRecoveredVideos = 0;
var totalNumProcessedVideos = 0;

var youtubeMetrics = ['views','annotationClickThroughRate','annotationCloseRate','likes','shares','comments','averageViewDuration','dislikes','estimatedMinutesWatched','subscribersGained','subscribersLost']
var fieldNames = ['videoId','day','title'].concat(youtubeMetrics);
var fieldTypes = ['string','date','string','int','float','float','int','int','int','int','int','int','int','int'];
var dataToReturn = [];

var ONE_MONTH_IN_MILLISECONDS = 1000 * 60 * 60 * 24 * 30 * 12 * 5;
var ONE_DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;
var channelId;

// Upon loading, the Google APIs JS client automatically invokes this callback.
// See https://developers.google.com/api-client-library/javascript/features/authentication 
window.onJSClientLoad = function() {
	gapi.auth.init(function() {
		window.setTimeout(checkAuth, 1);
	});
};

// Attempt the immediate OAuth 2.0 client flow as soon as the page loads.
// If the currently logged-in Google Account has previously authorized
// the client specified as the OAUTH2_CLIENT_ID, then the authorization
// succeeds with no user intervention. Otherwise, it fails and the
// user interface that prompts for authorization needs to display.
function checkAuth() {
	if(tableau.password) {
		console.log("Setting the access token from tableau");
		gapi.auth.setToken({access_token: tableau.password});
	}

	gapi.auth.authorize({
		client_id: config.clientId,
		scope: config.scopes,
		immediate: true
	}, handleAuthResult);
}

// Handle the result of a gapi.auth.authorize() call.
function handleAuthResult(authResult) {
	if (authResult && authResult.status && authResult.status.signed_in) {
		// Authorization was successful. Hide authorization prompts and show
		// content that should be visible after authorization succeeds.
		$(".notsignedin").css('display', 'none');
		$(".signedin").css('display', 'block');
		tableau.password = gapi.auth.getToken().access_token;
	} else {
		// Authorization was unsuccessful. Show content related to prompting for
		// authorization and hide content that should be visible if authorization
		// succeeds.
		$(".notsignedin").css('display', 'block');
		$(".signedin").css('display', 'none');
		// Make the #login-link clickable. Attempt a non-immediate OAuth 2.0
		// client flow. The current function is called when that flow completes.
		$('#connectbutton').click(function() {
			gapi.auth.authorize({
				client_id: config.clientId,
				scope: config.scopes,
				immediate: false
			}, handleAuthResult);
		});
	}
}

// Stop the waiting timer and returning the recovered data to tableau
function checkTimer() {
	if(videosRecovered && 
		(totalNumProcessedVideos == totalNumRecoveredVideos)) {
		console.log(dataToReturn);
		tableau.dataCallback(dataToReturn, lastRecordToken, hasMore);
		window.clearInterval(asyncChecker);
	}
}

// More info is available at
// https://developers.google.com/api-client-library/javascript/dev/dev_jscript#loading-the-client-library-and-the-api
function setDataToReturn() {
	gapi.client.load('youtube', 'v3').then(function() {
		gapi.client.load('youtubeAnalytics', 'v1').then(function() {
			// After both client interfaces load, use the Data API to request
			// information about the authenticated user's channel.
			setDataToReturnForUserChannel();
		});
	});
}

// Call the Data API to retrieve information about the currently
// authenticated user's YouTube channel.
function setDataToReturnForUserChannel() {
	// Also see: https://developers.google.com/youtube/v3/docs/channels/list
	var request = gapi.client.youtube.channels.list({
		// Setting the "mine" request parameter's value to "true" indicates that
		// you want to retrieve the currently authenticated user's channel.
		mine: true,
		part: 'id,contentDetails'
	});

	request.execute(function(response) {
		if ('error' in response) {
			console.log("Error getting the user channels: " + response.error.message);
		} else {
			// We need the channel's channel ID to make calls to the Analytics API.
			// The channel ID value has the form "UCdLFeWKpkLhkguiMZUp8lWA".
			channelId = response.items[0].id;
			// Retrieve the playlist ID that uniquely identifies the playlist of
			// videos uploaded to the authenticated user's channel. This value has
			// the form "UUdLFeWKpkLhkguiMZUp8lWA".
			var uploadsListId = response.items[0].contentDetails.relatedPlaylists.uploads;
			// Use the playlist ID to retrieve the list of uploaded videos.
			setDataToReturnForPlaylistItems(uploadsListId);
		}
	});
}

// Call the Data API to retrieve the items in a particular playlist. In this
// example, we are retrieving a playlist of the currently authenticated user's
// uploaded videos. By default, the list returns the most recent videos first.
function setDataToReturnForPlaylistItems(listId) {
	// See https://developers.google.com/youtube/v3/docs/playlistitems/list
	var request = gapi.client.youtube.playlistItems.list({
		playlistId: listId,
		part: 'snippet'
	});

	request.execute(function(response) {
		if ('error' in response) {
			console.log("Error getting the playlist items: " + response.error.message);
		} else {
			if ('items' in response) {
				// The jQuery.map() function iterates through all of the items in
				// the response and creates a new array that only contains the
				// specific property we're looking for: videoId.
				var videoIds = $.map(response.items, function(item) {
					return item.snippet.resourceId.videoId;
				});

				// Now that we know the IDs of all the videos in the uploads list,
				// we can retrieve information about each video.
				setDataToReturnForVideos(videoIds);
			} else {
				console.log('There are no videos in the channel.');
			}
		}
	});
}

// Given an array of video IDs, this function obtains metadata about each
// video and then uses that metadata to display a list of videos.
function setDataToReturnForVideos(videoIds) {
	// https://developers.google.com/youtube/v3/docs/videos/list
	var request = gapi.client.youtube.videos.list({
	// The 'id' property's value is a comma-separated string of video IDs.
		id: videoIds.join(','),
		part: 'id,snippet,statistics'
	});

	request.execute(function(response) {
		if ('error' in response) {
			console.log("Error getting video list: " + response.error.message);
		} else {
			// Setting the total number of views recovered in the request
			totalNumRecoveredVideos = response.items.length;
			videosRecovered = true;

			// Get the jQuery wrapper for the #video-list element before starting the loop.
			$.each(response.items, function() {
				// Exclude videos that do not have any views, since those videos
				// will not have any interesting viewcount Analytics data.
				if (this.statistics.viewCount == 0) {
					totalNumProcessedVideos++;
					return;
				}
				setDataToReturnForVideoAnalytics(this.id, this.snippet.title);
			});
		}
	});
}

// This function requests YouTube Analytics data for a video.
function setDataToReturnForVideoAnalytics(videoId, title) {
	if (channelId) {
		// To use a different date range, modify the ONE_MONTH_IN_MILLISECONDS
		// variable to a different millisecond delta as desired.
		var today = new Date();
		var startDate;
		if(lastRecordToken) {
			startDate = new Date(lastRecordToken);
			startDate.setTime(startDate.getTime() + ONE_DAY_IN_MILLISECONDS);
		} else {
			startDate = new Date(today.getTime() - ONE_MONTH_IN_MILLISECONDS);
		}

		var request = gapi.client.youtubeAnalytics.reports.query({
			// The start-date and end-date parameters must be YYYY-MM-DD strings.
			'start-date': formatDateString(startDate),
			'end-date': formatDateString(today),
			// At this time, you need to explicitly specify channel==channelId.
			// See https://developers.google.com/youtube/analytics/v1/#ids
			ids: 'channel==' + channelId,
			dimensions: 'day,video',
			sort: 'day',
			// See https://developers.google.com/youtube/analytics/v1/available_reports
			// for details about the different filters and metrics you can request
			// if the "dimensions" parameter value is "day".
			metrics: youtubeMetrics.join(','),
			filters: 'video==' + videoId
		});

		request.execute(function(response) {
			// This function is called regardless of whether the request succeeds.
			// The response contains YouTube Analytics data or an error message.
			if ('error' in response) {
				console.log("Error geting video stats: " + response.error.message);
			} else {
				setDataToReturnForAnalyticsResponse(videoId, title, response);
			}
 		});
	} else {
		// The currently authenticated user's channel ID is not available.
		console.log('The YouTube channel ID for the current user is not available.');
	}
}

function setDataToReturnForAnalyticsResponse(videoId, title, response) {
	if ('rows' in response) {
		$.each(response.rows, function() {
			var item = {title : title, videoId : videoId};
			for(ii = 0; ii < this.length; ii++) {
				item[response.columnHeaders[ii].name] = this[ii];
			}
			dataToReturn.push(item);
		});
		totalNumProcessedVideos++;
	} else {
		console.log('No data available for video ' + videoId);
	}
}


// This boilerplate code takes a Date object and returns a YYYY-MM-DD string.
function formatDateString(date) {
	var yyyy = date.getFullYear().toString();
	var mm = padToTwoCharacters(date.getMonth() + 1);
	var dd = padToTwoCharacters(date.getDate());

	return yyyy + '-' + mm + '-' + dd;
}

// If number is a single digit, prepend a '0'. Otherwise, return the number
//  as a string.
function padToTwoCharacters(number) {
	if (number < 10) {
		return '0' + number;
	} else {
		return number.toString();
	}
}

//------------- Tableau WDC code -------------//
var myConnector = tableau.makeConnector();

myConnector.init = function() {
	checkAuth();

	tableau.incrementalExtractColumn = "day";

	if (tableau.phase == tableau.phaseEnum.authPhase) {
		// Auto-submit here if we are in the auth phase
		tableau.submit()
	}

	if (tableau.phase == tableau.phaseEnum.authPhase) {
		$("#getmychannelbutton").css('display', 'none');
	}

	$("#getmychannelbutton").click(function() {
		tableau.connectionName = "My Youtube channel stats";
		tableau.alwaysShowAuthUI = true;
		tableau.submit();  // This ends the UI phase
	});
	tableau.initCallback();
};

myConnector.getColumnHeaders = function() {
	tableau.headersCallback(fieldNames, fieldTypes);
};

myConnector.getTableData = function(lastRecordTokenParam) {
	hasMore = false;
	connectionData = tableau.connectionData ? JSON.parse(tableau.connectionData) : {};
	lastRecordToken = lastRecordTokenParam;

	setDataToReturn(dataToReturn);
	asyncChecker = window.setInterval(checkTimer, config.checkInterval);
	//tableau.abortWithError("No results found");
};

// Register the tableau connector--call this last
tableau.registerConnector(myConnector);

})();
