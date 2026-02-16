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

module.exports = { friendsLogsResponse, emptyLogsResponse, errorResponse };
