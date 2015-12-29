window.addEventListener('DOMContentLoaded', function() {
  var friends = $('#friends');
  var own = $('#own');
  var limit = $('#limit');
  limit.val(5);


  chrome.storage.local.get(DEFAULT_VALUES, function(items) {
    if (typeof items["showFriendsLogs"] != 'undefined') {
      if (items["showFriendsLogs"]) {
        friends.iCheck('check');
      } else {
        friends.iCheck('unchecked');
      }
    } else {
      friends.iCheck('check');
      chrome.storage.local.set({
        'showFriendsLogs': true
      }, null);
    }
    if (typeof items["showMyLogs"] != 'undefined') {
      if (items["showMyLogs"]) {
        own.iCheck('check');
      } else {
        own.iCheck('unchecked');
      }
    } else {
      own.iCheck('uncheck');
      chrome.storage.local.set({
        'showMyLogs': false
      }, null);
    }

    if (typeof items["limit"] != 'undefined') {
      limit.val(items["limit"]);
    } else {
      limit.val(5);
      chrome.storage.local.set({
        'limit': "5"
      }, null);
    }
  });

  friends.on('ifChecked', function() {
    chrome.storage.local.set({
      'showFriendsLogs': true
    }, null);
  });

  friends.on('ifUnchecked', function() {
    chrome.storage.local.set({
      'showFriendsLogs': false
    }, null);
  });

  own.on('ifChecked', function() {
    chrome.storage.local.set({
      'showMyLogs': true
    }, null);
  });

  own.on('ifUnchecked', function() {
    chrome.storage.local.set({
      'showMyLogs': false
    }, null);
  });

  limit.on('change', function() {
    chrome.storage.local.set({
      'limit': limit.val()
    }, null);
  });
});