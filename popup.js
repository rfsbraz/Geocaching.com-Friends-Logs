window.addEventListener('DOMContentLoaded', function() {
    var friends  = document.querySelector('input#friends');
    var own  = document.querySelector('input#own');
    var limit  = document.querySelector('#limit');
    limit.value = 5;
     chrome.storage.local.get(null, function(items) {
        if (typeof items["showFriendsLogs"] != 'undefined') {
          friends.checked = items["showFriendsLogs"];
        } else {
          friends.checked = true;
           chrome.storage.local.set({'showFriendsLogs': true}, function() {
                // Notify that we saved.
              });
        }
          if(typeof items["showMyLogs"] != 'undefined'){
          own.checked = items["showMyLogs"];

          }
        else {
          own.checked = false;
           chrome.storage.local.set({'showMyLogs': false}, function() {
                // Notify that we saved.
              });
        }

         if(typeof items["limit"] != 'undefined'){
            limit.value = items["limit"];
         }
        else{
            limit.value = 5;
            chrome.storage.local.set({'limit': "5"}, function() {
                // Notify that we saved.
              });
        }
      });

    friends.addEventListener('click', function() {

         chrome.storage.local.set({'showFriendsLogs': friends.checked}, function() {
              // Notify that we saved.
            });
           
    });
     own.addEventListener('click', function() {

         chrome.storage.local.set({'showMyLogs': own.checked}, function() {
              // Notify that we saved.
            });
           
    });
     limit.addEventListener('change', function() {
         chrome.storage.local.set({'limit': limit.value}, function() {
         
         });
           
    });
});