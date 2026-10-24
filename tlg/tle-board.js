var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var EXTRA_OFF = 324 * 9;
  var END_OFF = EXTRA_OFF + 729;

  function newState() {
    var st = {
      cs: new Uint8Array(729),
      solvedCount: 0,
      candMask: new Uint32Array(NW),
      cidx: new Int16Array(729).fill(-1),
      candList: null,
      ncands: 0,
      setOff: new Int32Array(326),
      setLen: new Int16Array(326),
      setSize: new Int16Array(326),
      setList: new Int16Array(END_OFF),
      setMask: new Uint32Array(326 * NW),
      truths: [],
      links: [],
      nT: 0,
      nL: 0,
      linkState: new Uint16Array(326),
      linkTc: new Uint16Array(326),
      anaMark: new Uint8Array(326),
      kz: new Uint8Array(729),
      TC: new Uint32Array(NW),
      LC: new Uint32Array(NW),
      killMask: new Uint32Array(NW),
      kills: [],
      lives: [],
      tcList: null,
      tcLocal: new Int16Array(729).fill(-1),
      solW: 1,
      sols: null,
      nsol: 0,
      ncand: 0,
      nspan: 0,
      nlsat: 0,
      nkill: 0,
      nlive: 0,
      ndkill: 0,
      flags: 0,
      rc: 0,
      rank: 0,
      rankField: 4096,
      rankOverlap: 0,
      nExact: 0,
      nset: 0,
      fallbackUsed: null,
      TU: new Uint32Array(NW),
      T: new Int32Array(10),
      tOver: 0,
      spanList: [],
      spanCount: 0,
      marks: new Uint8Array(729),
      uniqueSolution: true,
      applyAur: false,
      vapply: false,
      vcount: 0,
      vN: 0,
      nv: 0,
      extraMembers: [],
      applyMode: false,
      extraMult: 1,
      aurMarks: [],
      aurList: [],
      aurFailed: 0,
      aurCause: 0,
      failSols: null,
      isvir: 0,
      visnp: 0,
      visnn: 0,
      wantPerms: undefined,
      highlightAls: false,
      CF: 0,
      pathCF: 0,
      bestAls: -1,
      alsCells: new Int32Array(81),
      alsSets: new Int32Array(326),
      role: new Uint8Array(326),
      nbCache: null
    };
    for (var s = 0; s <= 324; s++) st.setOff[s] = s * 9;
    st.setOff[325] = END_OFF;
    TLE.initStats(st);
    /* @edition-slot board-001 */
    return st;
  }

  function loadBoard(st, values, candidates) {
    var cs = st.cs;
    var solved = 0;
    for (var cell = 0; cell < 81; cell++) {
      var v = values[cell] | 0;
      var base = cell * 9;
      if (v > 0 && v <= 9) {
        cs[base + v - 1] = 2;
      } else {
        var bits = candidates[cell] | 0;
        for (var d = 0; d < 9; d++) if (bits & (1 << d)) cs[base + d] = 1;
      }
    }
    var mask = st.candMask;
    var list = [];
    var cidx = st.cidx;
    for (var c = 0; c < 729; c++) {
      if (cs[c] === 1) {
        cidx[c] = list.length;
        list.push(c);
        mask[c >> 5] |= 1 << (c & 31);
      } else if (cs[c] === 2) {
        solved++;
      }
    }
    st.candList = list;
    st.ncands = list.length;
    st.solvedCount = solved;
    var slots = TLE.setSlots;
    var setList = st.setList;
    var setLen = st.setLen;
    var setMask = st.setMask;
    for (var s = 0; s < 324; s++) {
      var off = s * 9;
      var n = 0;
      for (var p = 0; p < 9; p++) {
        var x = slots[off + p];
        if (cs[x] === 1) {
          setList[off + n++] = x;
          setMask[s * NW + (x >> 5)] |= 1 << (x & 31);
        }
      }
      setLen[s] = n;
      st.setSize[s] = n;
    }
  }

  function setPath(st, truths, links) {
    st.truths = truths;
    st.links = links;
    st.nT = truths.length;
    st.nL = links.length;
    var ls = st.linkState;
    for (var s = 0; s < 326; s++) ls[s] &= 0x7fff;
    for (var j = 0; j < links.length; j++) ls[links[j]] |= 0x8000;
  }

  TLE.newState = newState;
  TLE.loadBoard = loadBoard;
  TLE.setPath = setPath;
  TLE.resetState = function () {
    return newState();
  };
})();
