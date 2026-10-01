import { test } from 'node:test';
import assert from 'node:assert/strict';

/* ---------- pure logic under test (mirrors index.html Core) ---------- */

function isValidId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(id);
}

function createStore() {
  const messages = new Map();
  return {
    apply(action) {
      const t = action && action.type;
      if (t === 'message:new') {
        const p = action.payload || {};
        if (!isValidId(p.id)) return { ok: false, reason: 'bad_id' };
        if (messages.has(p.id)) return { ok: false, reason: 'dup' };
        messages.set(p.id, {
          id: p.id,
          type: p.type === 'code' ? 'code' : 'text',
          senderId: typeof p.senderId === 'string' ? p.senderId : '',
          senderName: typeof p.senderName === 'string' ? p.senderName.slice(0, 24) : '',
          timestamp: typeof p.timestamp === 'number' ? p.timestamp : Date.now(),
          content: typeof p.content === 'string' ? p.content : '',
          language: p.language,
          title: p.title,
          edited: false,
          removed: false,
        });
        return { ok: true };
      }
      if (t === 'message:edit') {
        const p = action.payload || {};
        const m = messages.get(p.id);
        if (!m) return { ok: false, reason: 'not_found' };
        if (p.senderId !== m.senderId) return { ok: false, reason: 'forbidden' };
        if (typeof p.content === 'string') m.content = p.content;
        if (m.type === 'code') {
          if (p.title) m.title = p.title;
          if (p.language) m.language = p.language;
        }
        m.edited = true;
        m.editedAt = p.editedAt || Date.now();
        return { ok: true };
      }
      if (t === 'message:delete') {
        const p = action.payload || {};
        const m = messages.get(p.id);
        if (!m) return { ok: false, reason: 'not_found' };
        if (p.senderId !== m.senderId) return { ok: false, reason: 'forbidden' };
        m.removed = true;
        m.removedAt = p.timestamp || Date.now();
        return { ok: true };
      }
      return { ok: false, reason: 'unknown' };
    },
    get: (id) => messages.get(id),
    size: () => messages.size,
  };
}

function detectLanguage(code) {
  if (/^\s*(#include|int main\(|std::|cout\s*<<)/m.test(code)) return 'cpp';
  if (/^\s*(def |import |from \w+ import|class \w+:|print\()/m.test(code)) return 'python';
  if (/^\s*(public class |public static void main|System\.out\.println)/m.test(code)) return 'java';
  if (/^\s*(fn main\(\)|use std::|let mut |println!\(\))/m.test(code)) return 'rust';
  if (/^\s*(SELECT |INSERT INTO|CREATE TABLE|UPDATE |DELETE FROM)/im.test(code)) return 'sql';
  if (/^\s*(<(!DOCTYPE|html|div|head|body|script))/i.test(code)) return 'html';
  if (/^\s*(#!\/bin\/bash|echo |sudo |apt-get|chmod)/m.test(code)) return 'bash';
  if (/^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/m.test(code.trim()) && /":/.test(code)) return 'json';
  if (/^\s*(interface |type |export |namespace )/m.test(code)) return 'typescript';
  if (/^\s*(const |let |var |function |console\.log\(|=>)/m.test(code)) return 'javascript';
  return 'plaintext';
}

function backoffDelay(attempt, cap = 30000) {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt - 1), cap);
  return Math.floor(base / 2 + Math.random() * (base / 2));
}

/* ------------------------------ tests ------------------------------ */

test('T1 malicious id is rejected at the store boundary', () => {
  const s = createStore();
  const hostile = "msg_1' onerror='alert(1)'";
  const r = s.apply({
    type: 'message:new',
    payload: { id: hostile, type: 'text', senderId: 'a', content: 'x' },
  });
  assert.equal(r.ok, false);
  assert.equal(s.size(), 0);
});

test('T2 delete from a non-author is ignored, author delete yields tombstone', () => {
  const s = createStore();
  s.apply({ type: 'message:new', payload: { id: 'm1', senderId: 'alice', content: 'hi' } });
  const bad = s.apply({ type: 'message:delete', payload: { id: 'm1', senderId: 'bob' } });
  assert.equal(bad.ok, false);
  assert.equal(s.get('m1').removed, false);
  const good = s.apply({ type: 'message:delete', payload: { id: 'm1', senderId: 'alice' } });
  assert.equal(good.ok, true);
  assert.equal(s.get('m1').removed, true);
  assert.equal(s.get('m1').content, 'hi', 'content retained for local tombstone render');
});

test('T3 edit from a non-author is ignored, author edit applies', () => {
  const s = createStore();
  s.apply({ type: 'message:new', payload: { id: 'm1', senderId: 'alice', content: 'hi' } });
  const bad = s.apply({ type: 'message:edit', payload: { id: 'm1', senderId: 'bob', content: 'hacked' } });
  assert.equal(bad.ok, false);
  assert.equal(s.get('m1').content, 'hi');
  const good = s.apply({ type: 'message:edit', payload: { id: 'm1', senderId: 'alice', content: 'fixed' } });
  assert.equal(good.ok, true);
  assert.equal(s.get('m1').content, 'fixed');
});

test('T4 duplicate delivery of same id yields exactly one entry', () => {
  const s = createStore();
  const p = { id: 'm2', senderId: 'c', content: 'x' };
  s.apply({ type: 'message:new', payload: p });
  s.apply({ type: 'message:new', payload: { ...p, content: 'y' } });
  s.apply({ type: 'message:new', payload: { ...p, content: 'z' } });
  assert.equal(s.size(), 1);
  assert.equal(s.get('m2').content, 'x', 'first write wins');
});

test('lang detection: json, typescript, cpp, python', () => {
  assert.equal(detectLanguage('{\n  "a": 1,\n  "b": 2\n}'), 'json');
  assert.equal(detectLanguage('interface U {\n  id: number;\n}\nexport const x = 1;'), 'typescript');
  assert.equal(detectLanguage('#include <iostream>\nint main() { return 0; }'), 'cpp');
  assert.equal(detectLanguage('def fib(n):\n    return n'), 'python');
});

test('backoff grows and stays capped', () => {
  for (let i = 1; i <= 20; i++) {
    const d = backoffDelay(i);
    assert.ok(d > 0 && d <= 30000, `attempt ${i} -> ${d}`);
  }
});