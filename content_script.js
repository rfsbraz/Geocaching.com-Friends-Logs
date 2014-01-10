function loadLogbookPage(tableIdx, pageIdx, showPersonal, showFriends) {

    isBusy = true;

    var tabInfo = tabStatus[tableIdx];

    $.getJSON("/seek/geocache.logbook", { tkn: userToken, idx: pageIdx + 1, num: 10, sp: showPersonal, sf: showFriends, decrypt: decryptLogs },
    function (response) {
        if (response.status == "success") {
            if (!tabInfo.loaded) {
                tabInfo.loaded = true;
                $("#" + tabInfo.name)
                    .parent("div.ui-tabs-panel").find("div.pager").pagination(response.pageInfo.totalRows, pgrOptions);
                $("span.count-idx-" + tabInfo.idx).text(response.pageInfo.totalRows);
            }

            if (response.pageInfo.rows > 0) {
                var $newBody = $(document.createElement("TBODY"));
                $.tmpl("tmplCacheLogRow", response.data).appendTo($newBody);
                $newBody.find("a.tb_images").each(function () {
                    var $this = $(this);
                    $this.fancybox({
                        'type': 'image',
                        'titlePosition': 'inside',
                        'padding': 10,
                        titleFormat: function () { return $this.data('title'); }
                    });
                });
                $("#" + tabInfo.name)
                        .empty().append($newBody.children());
            }

            if ($("#log_tabs").offset().top - $(window).scrollTop() < 0) {
                $.scrollTo($pageTabs);
            }

            isBusy = false;
        }
    });

}

// Example in addi
var h1 = document.createElement("h1");
h1.innerHTML = "Injected text";    

$("#cache_logs_container")[0].insertBefore(h1, $("#cache_logs_container")[0].firstChild);