const fs = require('fs');
const path = require('path');

// The popup and the cache page read every visible string from _locales (#122).

const ROOT = path.join(__dirname, '..', '..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');

function readMessages(locale) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, '_locales', locale, 'messages.json'), 'utf8')
  );
}

/**
 * chrome.i18n.getMessage for one locale, with the same $NAME$ placeholder and
 * $1 substitution rules the browser applies.
 */
function getMessageFor(locale) {
  const messages = readMessages(locale);
  return (key, substitutions = []) => {
    const entry = messages[key];
    if (!entry) {
      return '';
    }
    const subs = [].concat(substitutions).map(String);
    const fill = text => text.replace(/\$(\d)/g, (_, n) => subs[Number(n) - 1] ?? '');
    return entry.message.replace(/\$([A-Za-z0-9_@]+)\$/g, (_, name) => {
      const placeholder = entry.placeholders && entry.placeholders[name.toLowerCase()];
      return placeholder ? fill(placeholder.content) : '';
    });
  };
}

function loadPopup() {
  document.documentElement.innerHTML = POPUP_HTML.replace(/<!doctype html>/i, '');
  let popup;
  jest.isolateModules(() => {
    popup = require('../../popup');
  });
  popup.localizePopup(document);
}

const visibleText = () =>
  [
    ...document.querySelectorAll(
      '.header-title, .toggle-label, .setting-description, .select-label, option, .footer-link'
    )
  ].map(el => el.textContent.replace(/\s+/g, ' ').trim());

describe('popup text', () => {
  afterEach(() => {
    chrome.i18n.getMessage.mockReset();
  });

  test('every string the popup shows comes from messages', () => {
    chrome.i18n.getMessage.mockImplementation(key => `msg:${key}`);
    loadPopup();
    const texts = visibleText().filter(text => text !== 'Friends Logs');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).toMatch(/^msg:/);
    }
  });

  test('English reads the same as before', () => {
    chrome.i18n.getMessage.mockImplementation(getMessageFor('en'));
    loadPopup();
    expect(visibleText()).toEqual([
      'Friends Logs',
      "Show friends' logs",
      'Highlight logs from your friends list',
      'Show my logs',
      'Highlight your own logs on cache pages',
      'Friends logs limit',
      '5 logs',
      '10 logs',
      '20 logs',
      '50 logs',
      '100 logs',
      "Maximum number of friends' logs to display",
      'Rate extension',
      'Report issue'
    ]);
  });

  test('pt-PT shows the Portuguese strings with the limit in each option', () => {
    chrome.i18n.getMessage.mockImplementation(getMessageFor('pt_PT'));
    loadPopup();
    expect(visibleText()).toEqual([
      'Friends Logs',
      'Mostrar os logs dos amigos',
      'Destaca os logs da sua lista de amigos',
      'Mostrar os meus logs',
      'Destaca os seus próprios logs nas páginas de cache',
      'Limite de logs de amigos',
      '5 logs',
      '10 logs',
      '20 logs',
      '50 logs',
      '100 logs',
      'Número máximo de logs de amigos a mostrar',
      'Avaliar a extensão',
      'Comunicar um problema'
    ]);
  });

  test('keeps the English markup text when a message is missing', () => {
    chrome.i18n.getMessage.mockImplementation(() => '');
    loadPopup();
    expect(visibleText()).toContain("Show friends' logs");
  });
});

describe('cache page text', () => {
  let contentScript;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.isolateModules(() => {
      chrome.storage.local.get.mockImplementation(() => {});
      contentScript = require('../../content_script');
    });
  });

  afterEach(() => {
    chrome.i18n.getMessage.mockReset();
  });

  const labels = () => JSON.parse(document.getElementById('inject').getAttribute('data-labels'));

  test('hands the pt-PT section headers to the injected script', () => {
    chrome.i18n.getMessage.mockImplementation(getMessageFor('pt_PT'));
    contentScript.injectScript('inject.js', 'body', false, true, 5);
    expect(labels()).toEqual({
      friendsLog: '1 log de amigo',
      friendsLogs: '{count} logs de amigos',
      myLog: 'O meu log',
      myLogs: 'Os meus logs',
      logbook: 'Logbook'
    });
  });

  test('English headers read the same as before', () => {
    chrome.i18n.getMessage.mockImplementation(getMessageFor('en'));
    contentScript.injectScript('inject.js', 'body', false, true, 5);
    expect(labels()).toEqual({
      friendsLog: '1 Friend Log',
      friendsLogs: '{count} Friends Logs',
      myLog: 'My Log',
      myLogs: 'My Logs',
      logbook: 'Logbook'
    });
  });

  test('leaves out missing messages so the injected script keeps its English', () => {
    chrome.i18n.getMessage.mockImplementation(() => '');
    contentScript.injectScript('inject.js', 'body', false, true, 5);
    expect(labels()).toEqual({});
  });
});
