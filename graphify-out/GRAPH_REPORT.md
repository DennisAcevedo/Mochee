# Graph Report - .  (2026-10-10)

## Corpus Check
- 56 files · ~44,698 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 205 nodes · 247 edges · 43 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]

## God Nodes (most connected - your core abstractions)
1. `set()` - 15 edges
2. `Tutor3D` - 10 edges
3. `showStartScreen()` - 9 edges
4. `els()` - 8 edges
5. `killAll()` - 8 edges
6. `uiEls()` - 7 edges
7. `playIntro()` - 7 edges
8. `tint()` - 6 edges
9. `buildFull()` - 6 edges
10. `buildReduced()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `set()` --calls--> `roamTarget()`  [INFERRED]
  design\tutor-3d.js → src\animation\useTick.ts
- `startStudy()` --calls--> `newTutorId()`  [INFERRED]
  src\pages\CreateTutorPage.tsx → src\state\library.ts
- `get()` --calls--> `releaseEnv()`  [INFERRED]
  design\tutor-3d.js → src\scene\Lights.tsx
- `set()` --calls--> `createMaterials()`  [INFERRED]
  design\tutor-3d.js → src\character\materials.ts
- `set()` --calls--> `showStartScreen()`  [INFERRED]
  design\tutor-3d.js → src\intro\intro.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.23
Nodes (17): buildFull(), buildReduced(), disposeIntro(), els(), focusStart(), greet(), killAll(), overlayEls() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (11): lerp(), fallbackGreeting(), Lesson(), LessonPage(), lastStudiedLabel(), lookOf(), newTutorId(), startOfDay() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (6): addFiles(), next(), onDrop(), onPick(), startStudy(), now()

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (7): aimBoard(), clamp(), damp(), lib(), radialTex(), set(), Tutor3D

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (7): Board(), useCurrentTutor(), computeLayout(), useLayout(), Sidebar(), StartScreen(), TopBar()

### Community 5 - "Community 5"
Cohesion: 0.19
Nodes (6): buildBoardGeometry(), buildSkullGeometry(), clamp(), radialTexture(), tint(), createMaterials()

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (8): addTutorFiles(), getTutorFiles(), openDb(), run(), acquireEnv(), releaseEnv(), introRef(), get()

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (4): selectAnsweredRight(), selectAnsweredWrong(), selectExpression(), selectPose()

### Community 8 - "Community 8"
Cohesion: 0.38
Nodes (4): clamp(), region(), roamTarget(), sizeFor()

### Community 9 - "Community 9"
Cohesion: 0.6
Nodes (3): emit(), performAction(), setExpression()

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (2): isField(), onKey()

### Community 11 - "Community 11"
Cohesion: 0.8
Nodes (4): isTypingTarget(), live(), onDown(), onUp()

### Community 12 - "Community 12"
Cohesion: 0.5
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 0.83
Nodes (3): generateLesson(), studyLabels(), wait()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 17`** (2 nodes): `App()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `AnimatedRoutes()`, `AnimatedRoutes.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `createRigState()`, `rig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `Body()`, `Body.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `Cap()`, `Cap.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `Shadow()`, `Shadow.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `CharacterDirector()`, `CharacterDirector.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `ViewCamera.tsx`, `ViewCamera()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `MicButton()`, `MicButton.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `QuizCard()`, `QuizCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `SkipButton()`, `SkipButton.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `Toast.tsx`, `Toast()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `theme.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `introState.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `Character.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `Accessories.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `Face.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `Hands.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `catalog.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `mockLesson.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `Stage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `LectureContent.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `Transcript.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `set()` connect `Community 3` to `Community 8`, `Community 0`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.200) - this node is a cross-community bridge._
- **Why does `startStudy()` connect `Community 2` to `Community 1`, `Community 13`, `Community 6`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `now()` connect `Community 2` to `Community 3`, `Community 7`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `set()` (e.g. with `roamTarget()` and `createMaterials()`) actually correct?**
  _`set()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `showStartScreen()` (e.g. with `resetSceneRig()` and `set()`) actually correct?**
  _`showStartScreen()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._