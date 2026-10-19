/**
 * Mock API responses for E2E tests.
 * These simulate the geocaching.com logbook API.
 */

const friendsLogsResponse = {
  status: 'success',
  pageInfo: { rows: 2 },
  data: [
    {
      LogID: 1001,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: 'Great cache! Found it easily.',
      Created: '01/15/2024',
      Visited: '01/14/2024',
      UserName: 'FriendUser1',
      AccountID: 5001,
      AvatarImage: '',
      LogGuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      Images: []
    },
    {
      LogID: 1002,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: 'Nice hide in the park.',
      Created: '01/10/2024',
      Visited: '01/09/2024',
      UserName: 'FriendUser2',
      AccountID: 5002,
      AvatarImage: '',
      LogGuid: 'ffffffff-1111-2222-3333-444444444444',
      Images: []
    }
  ]
};

const personalLogsResponse = {
  status: 'success',
  pageInfo: { rows: 1 },
  data: [
    {
      LogID: 2001,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: 'My own find! Took me a while to spot.',
      Created: '02/01/2024',
      Visited: '01/31/2024',
      UserName: 'MyUsername',
      AccountID: 9001,
      AvatarImage: '',
      LogGuid: '11111111-2222-3333-4444-555555555555',
      Images: []
    }
  ]
};

const emptyLogsResponse = {
  status: 'success',
  pageInfo: { rows: 0 },
  data: []
};

const errorResponse = {
  status: 'error',
  pageInfo: { rows: 0 },
  data: []
};

const LONG_LOG_TEXT =
  'Absolutely spectacular cache with a long walk through dense woods, a cave to explore ' +
  'and a final that took us a while to find. This text is long on purpose so it fills the ' +
  'whole log column, wraps onto several lines and reaches the right edge of the row.';

/** Friend logs for the layout check (#141): one long and one short log text. */
const layoutFriendsLogsResponse = {
  status: 'success',
  pageInfo: { rows: 2 },
  data: [
    {
      LogID: 3001,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: LONG_LOG_TEXT,
      Created: '12/23/2011',
      Visited: '12/23/2011',
      UserName: 'LongLogFriend',
      AccountID: 6001,
      AvatarImage: '',
      LogGuid: '33333333-aaaa-bbbb-cccc-dddddddddddd',
      Images: []
    },
    {
      LogID: 3002,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: 'TFTC',
      Created: '01/10/2024',
      Visited: '01/09/2024',
      UserName: 'ShortLogFriend',
      AccountID: 6002,
      AvatarImage: '',
      LogGuid: '44444444-aaaa-bbbb-cccc-dddddddddddd',
      Images: []
    }
  ]
};

/** My log for the layout check (#141), with long log text. */
const layoutPersonalLogsResponse = {
  status: 'success',
  pageInfo: { rows: 1 },
  data: [
    {
      LogID: 3003,
      LogType: 'Found it',
      LogTypeImage: 'icon_smile.gif',
      LogText: LONG_LOG_TEXT,
      Created: '12/23/2011',
      Visited: '12/23/2011',
      UserName: 'MyUsername',
      AccountID: 9001,
      AvatarImage: '',
      LogGuid: '55555555-aaaa-bbbb-cccc-dddddddddddd',
      Images: []
    }
  ]
};

module.exports = {
  friendsLogsResponse,
  personalLogsResponse,
  emptyLogsResponse,
  errorResponse,
  layoutFriendsLogsResponse,
  layoutPersonalLogsResponse
};
