function injectScript(file, node, showMyLogs, showFriendsLogs, limit) {
    var th = document.getElementsByTagName(node)[0];
    var s = document.createElement('script');
    s.setAttribute('type', 'text/javascript');
    s.setAttribute('src', file);
    s.setAttribute('id', "inject");
    s.setAttribute('showFriendsLogs', showFriendsLogs);
    s.setAttribute('showMyLogs', showMyLogs);
    s.setAttribute('limit', limit);
    th.appendChild(s);
}

chrome.storage.local.get(null, function(items) {
    // If we call the method with both showMyLogs and showFriendsLogs false, the method just returns the logbook.
    var showMyLogs = items["showMyLogs"];
    var showFriendsLogs = items["showFriendsLogs"];

    if (!(showMyLogs === "false" && showFriendsLogs === "false")) {
        //only inject it if they aren't both false
        injectScript(chrome.extension.getURL('/inject.js'), 'body', showMyLogs, showFriendsLogs, items["limit"]);
    }
});