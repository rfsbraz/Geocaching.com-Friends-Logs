function loadLogbookPage(pageIdx, showPersonal, showFriends) {

    $.getJSON("/seek/geocache.logbook", { tkn: userToken, idx: pageIdx + 1, num: 10, sp: showPersonal, sf: showFriends, decrypt: decryptLogs },
    function (response) {
        if (response.status == "success") {
            
            if (response.pageInfo.rows > 0) {

                var logTbody = $("#cache_logs_table")[0].firstChild;

                //This needs a unique class, otherwise insertBefore("tbody") would insert it before any tbody on this page
                logTbody.nextSibling.className = "main_tbody";

                var logContainer = $("#cache_logs_container")[0];
                if(showFriends){
                    $("<h3>Friends Logs</h3>").insertBefore(logContainer.firstChild);
                } else if (showPersonal){
                    $("<h3>My Log</h3>").insertBefore(logContainer.firstChild);
                }

                var logs = $.tmpl("tmplCacheLogRow", response.data);
                logs.insertBefore(logTbody);
                logs.find("a.tb_images").each(function () {
                    var $this = $(this);
                    $this.fancybox({
                        'type': 'image',
                        'titlePosition': 'inside',
                        'padding': 10,
                        titleFormat: function () { return $this.data('title'); }
                    });
                });

                $("<h3></br>Logbook</h3>").insertBefore($(".main_tbody"));
            }

        }
    });

}

loadLogbookPage(0, false, true);