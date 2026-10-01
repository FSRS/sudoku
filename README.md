# fsrs Daily Sudoku

daily minimal minigame

## Only one cell Sudoku

Puzzles are checked for uniqueness first, using fast prerequisites and counting
at most two solutions when needed. Unique puzzles use classic mode; only
puzzles with multiple solutions are checked for
exactly one forced non-clue cell. The mode message appears above the grid. The
level, board score, lamp and solver measure the work through that cell's
placement; completing it finishes the puzzle. Uniqueness techniques are
automatically excluded without changing saved technique preferences.

Progress must preserve every solution allowed by the original clues. The lamp
turns black for any placement outside the forced cell, or for removing a
candidate that occurs in any original solution. Completion requires the correct
target digit and valid progress everywhere else. Candidate checks use the same
pencil note completeness convention as classic Sudoku; unentered or incomplete
notes are regenerated for evaluation. Feasibility proofs are cached per puzzle.

Initial and current board scores are hidden while playing this variant.
In solver mode the level label uses the compact format `Lv. 1 (SE 2.5)`,
with EP as the rating and both EP and ED in its tooltip; ER is unavailable.
SE and old SE support this mode. skfr is temporarily unavailable for these
puzzles: selecting it uses SE for the current puzzle while preserving the
global preference. Classic Sudoku still uses unmodified skfr. The rating
engine's pinned sources, patch and build instructions are in
[rating-source](rating-source/README.md).

## Acknowledgements and Third-Party Libraries

This project uses the skfr and SEROB engine to evaluate auxiliary puzzle difficulty.

### skfr License

skfr is distributed under the following BSD License terms:

```text
Copyright (c) 2011, OWNER: Gérard Penet
All rights reserved.
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:
Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.
Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.
Neither the name of the OWNER nor the names of its contributors
may be used to endorse or promote products derived from this software without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### SEROB license and source

SEROB is a rating-only WebAssembly adaptation derived from SukakuExplainer,
which is based on Sudoku Explainer by Nicolas Juillerat and the `serate`
modifications by gsf.

The SE-derived engine and its corresponding source are distributed under the
GNU Lesser General Public License version 2.1 only.
The original copyright notices and the complete license text are preserved in
[SEROB](https://github.com/PARK-SU/SEROB).
