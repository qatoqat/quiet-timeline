(function (XS) {
  'use strict';

  // Entry syntax: "word" matches the word plus plural (s/es); "word*" matches
  // anything starting with it. Matching is per whole token, so "class",
  // "Scunthorpe", "cocktail" or "Dickens" never match.
  const SLURS = [
    'nigger*', 'nigga*', 'niggaz', 'sandnigger*', 'faggot*', 'fag', 'fagg*', 'dyke', 'tranny', 'trannies',
    'troon*', 'shemale*', 'retard', 'retarded', 'tard', 'libtard*', 'chink', 'spic', 'spick', 'kike',
    'kyke', 'wetback*', 'gook', 'coon', 'beaner*', 'towelhead*', 'raghead*', 'paki', 'zipperhead*',
    'jigaboo*', 'golliwog*',
  ];

  const PROFANITY = [
    'fuck*', 'motherfuck*', 'fuk', 'fuking', 'fukin', 'fck', 'fcking', 'fckin', 'stfu', 'gtfo',
    'shit*', 'bullshit*', 'bitch*', 'cunt*', 'asshole*', 'arsehole*', 'ass', 'dumbass*', 'jackass',
    'dick', 'dickhead*', 'cock', 'cocksuck*', 'pussy', 'pussies', 'bastard', 'wanker', 'twat',
    'prick', 'whore*', 'slut*', 'piss', 'pissed', 'goddamn*', 'bollocks',
  ];

  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
  const MASKABLE = /[\p{L}\p{N}@$!|+*]/u;

  function normToken(tok) {
    let s = '';
    for (const ch of tok.toLowerCase()) {
      if (LEET[ch]) s += LEET[ch];
      else if (/\p{L}/u.test(ch)) s += ch;
    }
    return s;
  }

  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Repeated letters: "fuuuuck" should match, "shiitake" must not match "shit*".
  // A single letter in the word matches 1 or 3+ copies; a double matches 2+.
  function compile(entry) {
    const stem = entry.endsWith('*');
    const w = normToken(stem ? entry.slice(0, -1) : entry);
    if (!w) return null;
    const chars = [...w];
    let p = '';
    for (let i = 0; i < chars.length; ) {
      let j = i;
      while (j < chars.length && chars[j] === chars[i]) j++;
      const c = esc(chars[i]);
      p += j - i > 1 ? `${c}{${j - i},}` : `${c}(?:${c}${c}+)?`;
      i = j;
    }
    return p + (stem ? '\\p{L}*' : '(?:s|es)?');
  }

  function matcher(list) {
    const parts = list.map((e) => compile(e.trim().toLowerCase())).filter(Boolean);
    return parts.length ? new RegExp(`^(?:${parts.join('|')})$`, 'u') : null;
  }

  // settings → { find(text) → [{start, end, kind}], mask(text, kinds) → text }
  XS.createWordFilter = function (s) {
    const cats = /** @type {[string, RegExp][]} */ (
      [
        ['custom', matcher(XS.parseList(s.lang.custom))],
        ['slur', matcher(SLURS)],
        ['prof', matcher(PROFANITY)],
      ].filter((c) => c[1])
    );

    const classify = (norm) => {
      if (!norm) return null;
      for (const [kind, re] of cats) if (re.test(norm)) return kind;
      return null;
    };

    function find(text) {
      const hits = [];
      const toks = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) toks.push({ start: m.index, end: m.index + m[0].length, norm: normToken(m[0]) });

      for (let i = 0; i < toks.length; i++) {
        // "f u c k" — a run of 3+ single-letter tokens is checked as one word.
        if (toks[i].norm.length === 1) {
          let j = i;
          while (j < toks.length && toks[j].norm.length === 1) j++;
          if (j - i >= 3) {
            const kind = classify(toks.slice(i, j).map((t) => t.norm).join(''));
            if (kind) {
              hits.push({ start: toks[i].start, end: toks[j - 1].end, kind });
              i = j - 1;
              continue;
            }
          }
        }
        const kind = classify(toks[i].norm);
        if (kind) hits.push({ start: toks[i].start, end: toks[i].end, kind });
      }
      return hits;
    }

    // Keeps length and the first letter: "fucking" → "f••••••". Only touches
    // characters inside matches, so the text node can be updated in place.
    function mask(text, kinds) {
      const hits = find(text).filter((h) => kinds[h.kind]);
      if (!hits.length) return text;
      // Indices from find() are UTF-16 code units, so work on code units.
      const arr = text.split('');
      for (const h of hits) {
        let first = true;
        for (let k = h.start; k < h.end; k++) {
          if (!MASKABLE.test(arr[k])) continue;
          if (first) {
            first = false;
            continue;
          }
          arr[k] = '•';
        }
      }
      return arr.join('');
    }

    return { find, mask };
  };

})((globalThis.XS = globalThis.XS || {}));
