import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigation, readRoute, routeURL} from '../client/routing';

function browserHistory(initial = '/') {
  const events = new EventTarget();
  const entries = [initial];
  const states: unknown[] = [null];
  let index = 0;
  const browser = {
    get location() {return new URL(entries[index], 'https://arcade.test');},
    history: {
      get state() {return states[index];},
      pushState(state: unknown, _title: string, url: string) {entries.splice(++index); states.splice(index); entries.push(url); states.push(state);},
      replaceState(state: unknown, _title: string, url: string) {entries[index] = url; states[index] = state;},
      back() {index = Math.max(0, index - 1); events.dispatchEvent(new Event('popstate'));},
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    navigation: createNavigation(browser as unknown as Window), entries,
    go(delta: number) {index = Math.max(0, Math.min(entries.length - 1, index + delta)); events.dispatchEvent(new Event('popstate'));},
  };
}

test('back and forward restore party, studio, project and filter routes without replaying commands', () => {
  const {navigation, go, entries} = browserHistory();
  const seen: string[] = [];
  const unsubscribe = navigation.subscribe(() => seen.push(routeURL(navigation.getSnapshot())));
  navigation.navigate({roomId: 'friends'});
  navigation.navigate({roomId: 'friends', screen: 'studio'});
  navigation.navigate({roomId: 'friends', screen: 'studio', projectId: 'art'});
  navigation.navigate({roomId: 'friends', screen: 'studio', projectId: 'art'});
  assert.equal(entries.length, 4, 'same-screen updates do not add history');
  go(-1); assert.equal(navigation.getSnapshot().projectId, undefined);
  go(-1); assert.equal(navigation.getSnapshot().screen, undefined);
  assert.equal(navigation.getSnapshot().roomId, 'friends');
  go(1); assert.equal(navigation.getSnapshot().screen, 'studio');
  navigation.navigate({roomId: 'friends', filter: 'top'});
  go(1); assert.equal(navigation.getSnapshot().filter, 'top', 'new navigation discards the old forward branch');
  unsubscribe(); assert.equal(seen.length, 8);
});

test('closing a results dialog returns to its parent without duplicating history, including deep links', () => {
  const {navigation, entries, go} = browserHistory('/?room=party');
  const stop = navigation.subscribe(() => {});
  navigation.navigate({roomId:'party', matchId:'result'});
  navigation.dismiss({roomId:'party'});
  assert.equal(navigation.getSnapshot().matchId,undefined);assert.equal(entries.length,2);
  go(1);assert.equal(navigation.getSnapshot().matchId,'result');stop();
  const direct = browserHistory('/?match=result');
  const unsubscribe = direct.navigation.subscribe(() => {});
  direct.navigation.dismiss({});assert.deepEqual(direct.entries,['/']);unsubscribe();
});

test('deep links round-trip with encoded IDs and one-shot challenge replacement', () => {
  const deepLink = {roomId: 'party', screen: 'studio' as const, remixId: 'a&b', matchId: 'saved'};
  assert.equal(routeURL(readRoute(new URL(routeURL(deepLink), 'https://arcade.test').search)), routeURL(deepLink));
  const {navigation, entries, go} = browserHistory('/?challenge=old');
  const stop = navigation.subscribe(() => {});
  navigation.navigate({roomId: 'resolved'}, true);
  navigation.navigate({roomId: 'resolved', matchId: 'result'});
  go(-1); assert.equal(navigation.getSnapshot().roomId, 'resolved');
  assert.ok(entries.every(entry => !entry.includes('challenge=')));
  stop();
});
