(function() {
  var config = {
        clientId: 'ba2c0ee93b8c4061971c244ce8c1b37b',
        redirectUri: 'http://localhost:8888/Examples/instagram.html',
        authUrl: 'https://api.instagram.com/',
        count: 1
    };

  $(document).ready(function() {
      var accessToken = parseAccessToken();
      var hasAuth = accessToken && accessToken.length > 0;
      updateUIWithAuthState(hasAuth);

      $("#connectbutton").click(function() {
          doAuthRedirect();
      });
  });

  function updateUIWithAuthState(hasAuth) {
      if (hasAuth) {
            $(".notsignedin").css('display', 'none');
          $(".signedin").css('display', 'block');
      } else {
          $(".notsignedin").css('display', 'block');
          $(".signedin").css('display', 'none');
      }
  }

  function doAuthRedirect() {
      var url = config.authUrl + 'oauth/authorize?response_type=token&client_id='
                               + config.clientId
                               + '&redirect_uri='
                               + config.redirectUri;
      window.location.href = url;
  }

  function getRecentPostsURI(accessToken,nextMinId,nextMaxId) {
      return "https://api.instagram.com/v1/users/self/media/recent?access_token=" +
              accessToken + 
              '&count=' + config.count +
              '&min_id=' + (nextMinId || '') +
              '&max_id=' + (nextMaxId || '');
  }

  function parseAccessToken() {
      var query = window.location.hash.substring(1);
      var vars = query.split("&");
      var ii;
      for (ii = 0; ii < vars.length; ++ii) {
         var pair = vars[ii].split("=");
         if (pair[0] == "access_token") { return pair[1]; }
      }
      return(false);
  }

  //------------- Tableau WDC code -------------//
  var myConnector = tableau.makeConnector();

  myConnector.init = function() {
    var accessToken = parseAccessToken();
    var hasAuth = (accessToken && accessToken.length > 0) ||
                       tableau.password.length > 0;
    
    tableau.incrementalExtractColumn = "Id";

    if (tableau.phase == tableau.phaseEnum.interactivePhase ||
                         tableau.phase == tableau.phaseEnum.authPhase) {
      if (hasAuth) {
          tableau.password = accessToken;
          if (tableau.phase == tableau.phaseEnum.authPhase) {
              // Auto-submit here if we are in the auth phase
              tableau.submit()
          }
       }
    }

    updateUIWithAuthState(hasAuth);

    if (tableau.phase == tableau.phaseEnum.interactivePhase) {
       if (!hasAuth) {
        $("#getmymediabutton").css('display', 'none');     }
    }

    if (tableau.phase == tableau.phaseEnum.authPhase) {
    $("#getmymediabutton").css('display', 'none');
    }

    $("#getmymediabutton").click(function() {
      tableau.connectionName = "Instagram self publications";
      tableau.alwaysShowAuthUI = true;
      tableau.submit();  // This ends the UI phase
    });
    tableau.initCallback();
  };

  myConnector.getColumnHeaders = function() {
      var fieldNames = ["Id","Date", "Username", "Caption", "Comments", "Likes"];
      var fieldTypes = ["string","string","string","string","int","int"];
      tableau.headersCallback(fieldNames, fieldTypes);
  };

  myConnector.getTableData = function(lastRecordToken) {

console.log("lastRecordToken: " + lastRecordToken);
      var dataToReturn = [];
      var hasMoreData = false;
      var connectionData = tableau.connectionData ? JSON.parse(tableau.connectionData) : {};
      var next_min_id = "";
      var next_max_id = connectionData.next_max_id;

      if(lastRecordToken) {
          next_min_id = lastRecordToken;
      }

      var accessToken = tableau.password;
      var connectionUri = getRecentPostsURI(accessToken,next_min_id,next_max_id);
console.log("Connection URI: " + connectionUri);

      var xhr = $.ajax({
          url: connectionUri,
          dataType: 'jsonp',
          jsonp: 'callback',
          success: function (data) {
console.log(data);
              if (data.meta.code == 200) {
                  var posts = data.data;
                  var ii;
                  for (ii = 0; ii < posts.length; ++ii) {
                      var post = {
                                   'Id': posts[ii].id,
                                   'Date': posts[ii].created_time,
                                   'Username': posts[ii].user.username,
                                   'Caption': posts[ii].caption ? posts[ii].caption.text : "",
                                   'Comments': posts[ii].comments.count,
                                   'Likes': posts[ii].likes.count};
                      dataToReturn.push(post);
                  }

                  var hasMore = data.pagination.next_max_id;
                  if(!hasMore) {
                       connectionData.next_max_id = "";
                  } else {
                       connectionData.next_max_id = data.pagination.next_max_id;
                  }
                  tableau.connectionData = JSON.stringify(connectionData);
                  console.log("Setting connectionData.next_max_id: " + connectionData.next_max_id);

                  tableau.dataCallback(dataToReturn, lastRecordToken, hasMore);
              }
              else {
                  tableau.abortWithError("No results found");
              }
          },
          error: function (xhr, ajaxOptions, thrownError) {
              // If the connection fails, log the error and return an empty set.
              tableau.log("Connection error: " + xhr.responseText + "\n" +
                           thrownError);
              tableau.abortWithError("Error while trying to connect to Instagram.");
          }
      });
  };

  // Register the tableau connector--call this last
  tableau.registerConnector(myConnector);

  })();
