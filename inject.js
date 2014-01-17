function loadLogbookPage(pageIdx, showPersonal, showFriends, limit) {

    var loadPersonalAfter;

    if (showFriends === "true" && showPersonal === "true") {
        showPersonal = "false";
        loadPersonalAfter = "true";
    }

    $.getJSON("/seek/geocache.logbook", {
            tkn: userToken,
            idx: pageIdx + 1,
            num: limit,
            sp: showPersonal,
            sf: showFriends,
            decrypt: decryptLogs
        },
        function(response) {
            if (response.status == "success") {

                if (response.pageInfo.rows > 0) {

                    var logTbody = $("#cache_logs_table")[0].firstChild;

                    //This needs a unique class, otherwise insertBefore("tbody") would insert it before any tbody on this page
                    if ($(".main_tbody").length === 0) {
                        logTbody.nextSibling.className = "main_tbody";
                    }

                    var logContainer = $("#cache_logs_container")[0];
                    if (showFriends === "true") {

                        var breakLine;
                        if (typeof loadPersonalAfter === 'undefined') {
                            breakLine = "";
                        } else {
                            breakLine = "<br>";
                        }

                        if (response.pageInfo.rows == 1) {
                            $(breakLine + "<h3>1 Friend Log</h3>").insertBefore(logContainer.firstChild.nextSibling.firstChild);
                        } else {
                            //bigger than 1
                            $(breakLine + "<h3> " + response.pageInfo.rows + " Friends Logs</h3>").insertBefore(logContainer.firstChild.nextSibling.firstChild);
                        }
                    } else if (showPersonal === "true") {
                        if (response.pageInfo.rows == 1) {
                            $("<h3>My Log</h3>").insertBefore(logContainer.firstChild.nextSibling.firstChild);
                        } else {
                            //bigger than 1
                            $("<h3>My Logs</h3>").insertBefore(logContainer.firstChild.nextSibling.firstChild);
                        }
                    }

                    var logs = $.tmpl("tmplCacheLogRow", response.data);

                    //There is an issue of logs being loaded inside the images section, as a patch is better to remove them
                    //https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/1
                    $(logs).find("table").remove();
                    
                    logs.insertBefore(logTbody);
                    logs.find("a.tb_images").each(function() {
                        var $this = $(this);
                        $this.fancybox({
                            'type': 'image',
                            'titlePosition': 'inside',
                            'padding': 10,
                            titleFormat: function() {
                                return $this.data('title');
                            }
                        });
                    });

                    if (typeof loadPersonalAfter === 'undefined') {
                        $("<br><h3>Logbook</h3>").insertBefore($(".main_tbody"));
                    }
                }

                if (loadPersonalAfter === "true") {
                    loadLogbookPage(pageIdx, "true", "false", limit);
                }

            }
        });

}

loadLogbookPage(0, $("#inject").attr("showMyLogs"), $("#inject").attr("showFriendsLogs"), $("#inject").attr("limit"));