function loadLogbookPage(pageIdx, showPersonal, showFriends) {

    isBusy = true;

    $.getJSON("/seek/geocache.logbook", { tkn: userToken, idx: pageIdx + 1, num: 10, sp: showPersonal, sf: showFriends, decrypt: decryptLogs },
    function (response) {
        if (response.status == "success") {

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
                $newBody.insertBefore($("#cache_logs_container")[0].firstChild);
            }

            isBusy = false;
        }
    });

}

loadLogbookPage(0, false, true);