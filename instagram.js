(function() {
  var config = {
        clientId: 'ba2c0ee93b8c4061971c244ce8c1b37b',
        redirectUri: 'http://localhost:8888/Examples/instagram/instagram.html',
        //redirectUri: 'http://accesogroup.github.io/tableau-wdc/instagram.html',
        authUrl: 'https://api.instagram.com/',
        count: 6
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

  function getRecentPostsURI(accessToken,nextMaxId) {
      return "https://api.instagram.com/v1/users/self/media/recent?access_token=" +
              accessToken + 
              '&count=' + config.count +
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
    
    tableau.incrementalExtractColumn = "created_time";

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
      var fieldNames = ["id","created_time", "username", "caption", "num_comments", "num_likes"];
      var fieldTypes = ["string","datetime","string","string","int","int"];
      tableau.headersCallback(fieldNames, fieldTypes);
  };

  myConnector.getTableData = function(lastRecordToken) {
console.log("lastRecordToken: " + lastRecordToken);
      var lastRecordDate, lastRecordData = {};
      var dataToReturn = [];
      var connectionData = tableau.connectionData ? JSON.parse(tableau.connectionData) : {};

      if(lastRecordToken) {
          if(!isNaN(Date.parse(lastRecordToken))) {
              // Incremental call .. lastRecordToken is a date
              lastRecordDate = new Date(lastRecordToken);
              lastRecordData.lastRecordDate = lastRecordDate.toISOString();
          } else {
              // More results call .. lastRecordToken is a JSON
              lastRecordData = JSON.parse(lastRecordToken);
              if(lastRecordData.lastRecordDate) {
                   lastRecordDate = new Date(lastRecordData.lastRecordDate);
              }
          }
console.log("lastRecordDate: " + (lastRecordDate ? lastRecordDate.toISOString() : 'undefined'));
      }
      var maxId = lastRecordData.maxId;

      var accessToken = tableau.password;
      var connectionUri = getRecentPostsURI(accessToken,maxId);
console.log("ConnectionUri: " + connectionUri);
      var xhr = $.ajax({
          url: connectionUri,
          dataType: 'jsonp',
          jsonp: 'callback',
          success: function (data) {
              if (data.meta.code == 200) {
                  var posts = data.data;
                  var ii;
                  var previousDataToReturnLength = dataToReturn.length;
                  for (ii = 0; ii < posts.length; ++ii) {
                      var postCreatedDate = new Date(posts[ii].created_time * 1000);

console.log("postCreatedDate: " + postCreatedDate.toISOString());

                      if(!lastRecordDate || postCreatedDate > lastRecordDate) {
                            var post = {
                                   'id': posts[ii].id,
                                   'created_time': postCreatedDate,
                                   'username': posts[ii].user.username,
                                   'caption': posts[ii].caption ? posts[ii].caption.text : "",
                                   'num_comments': posts[ii].comments.count,
                                   'num_likes': posts[ii].likes.count};
                            dataToReturn.push(post);
                      }
                  }

console.log("posts.length: " + posts.length);
console.log("dataToReturn.length: " + dataToReturn.length);
console.log("previousDataToReturnLength: " + previousDataToReturnLength);

                  var hasMore = (posts.length == (dataToReturn.length - previousDataToReturnLength)) // We added every posts
                                && (data.pagination.next_max_id != null); // The server says that there are more posts waiting for us
                  if(hasMore) {
                       lastRecordData.maxId = data.pagination.next_max_id;
                  }

                  tableau.dataCallback(dataToReturn, JSON.stringify(lastRecordData), false /*hasMore*/);
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
