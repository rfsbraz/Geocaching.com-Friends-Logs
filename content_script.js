function injectScript(file, node, showFriendsLogs, showMyLogs, limit) {
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
    injectScript(chrome.extension.getURL('/inject.js'), 'body', items["showFriendsLogs"], items["showMyLogs"], items["limit"]);
});