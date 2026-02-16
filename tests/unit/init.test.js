const { DEFAULT_VALUES } = require('../../init');

describe('init.js', () => {
  describe('DEFAULT_VALUES', () => {
    test('has showFriendsLogs defaulting to true', () => {
      expect(DEFAULT_VALUES.showFriendsLogs).toBe(true);
    });

    test('has showMyLogs defaulting to false', () => {
      expect(DEFAULT_VALUES.showMyLogs).toBe(false);
    });

    test('has limit defaulting to 5', () => {
      expect(DEFAULT_VALUES.limit).toBe(5);
    });

    test('has exactly three properties', () => {
      expect(Object.keys(DEFAULT_VALUES)).toHaveLength(3);
    });
  });
});
