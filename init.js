/**
 * Default values for extension settings.
 * These are shared between content_script.js and popup.js.
 */
// eslint-disable-next-line no-unused-vars
const DEFAULT_VALUES = {
  showFriendsLogs: true,
  showMyLogs: false,
  limit: 5
};

/**
 * Initialize iCheck plugin for styled checkboxes.
 * Only runs on popup page where jQuery is loaded.
 */
if (typeof $ !== 'undefined' && typeof $.fn.iCheck !== 'undefined') {
  $(document).ready(function () {
    $('input').iCheck({
      checkboxClass: 'icheckbox_square',
      radioClass: 'iradio_square',
      increaseArea: '20%'
    });
  });
}
