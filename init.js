$(document).ready(function() {
	$('input').iCheck({
		checkboxClass: 'icheckbox_square',
		radioClass: 'iradio_square',
		increaseArea: '20%' // optional
	});
});

const DEFAULT_VALUES = {showFriendsLogs: true, showMyLogs: false, limit: 5};