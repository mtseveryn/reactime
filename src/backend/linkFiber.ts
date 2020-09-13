/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
import 'core-js';
/* eslint-disable indent */
/* eslint-disable brace-style */
/* eslint-disable comma-dangle */
/* eslint-disable no-underscore-dangle */
/* eslint-disable func-names */
/* eslint-disable no-use-before-define */
/* eslint-disable no-param-reassign */

import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Snapshot,
  Mode,
  ComponentData,
  HookStates,
  Fiber,
} from './types/backendTypes';
import Tree from './tree';
import componentActionsRecord from './masterState';
import { throttle, getHooksNames } from './helpers';

// Set global variables to use in exported module and helper functions
declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: any;
  }
}
let fiberRoot = null;
let doWork = true;
const circularComponentTable = new Set();
let allAtomsRelationship = [];
let isRecoil = false;

// Simple check for whether our target app uses Recoil
if (window[`$recoilDebugStates`]) {
  isRecoil = true;
}

function getRecoilState(): any {
  const RecoilSnapshotsLength = window[`$recoilDebugStates`].length;
  const lastRecoilSnapshot = window[`$recoilDebugStates`][RecoilSnapshotsLength - 1];
  const nodeToNodeSubs = lastRecoilSnapshot.nodeToNodeSubscriptions;
  const nodeToNodeSubsKeys = lastRecoilSnapshot.nodeToNodeSubscriptions.keys();
  nodeToNodeSubsKeys.forEach(
    node => {
      nodeToNodeSubs.get(node).forEach(
        nodeSubs => allAtomsRelationship.push([node, nodeSubs, 'atoms and selectors'])
      );
    }
  );
}

/**
 * @method sendSnapshot
 * @param snap The current snapshot
 * @param mode The current mode (i.e. jumping, time-traveling, locked, or paused)
 * @return Nothing.
 *
 * Middleware: Gets a copy of the current snap.tree and posts a recordSnap message to the window
 */
function sendSnapshot(snap: Snapshot, mode: Mode): void {
  // Don't send messages while jumping or while paused
  if (mode.jumping || mode.paused) return;

  if (!snap.tree) {
    snap.tree = new Tree('root', 'root');
  }

  const payload = snap.tree.cleanTreeCopy();
  if (isRecoil) {
    getRecoilState();
    payload.AtomsRelationship = allAtomsRelationship;
  }

  window.postMessage(
    {
      action: 'recordSnap',
      payload,
    },
    '*'
  );
  allAtomsRelationship = [];
}

/**
 * @function updateSnapShotTree
 * @param snap The current snapshot
 * @param mode The current mode (i.e. jumping, time-traveling, locked, or paused)
 * Middleware: Updates snap object with latest snapshot, using @sendSnapshot
 */
function updateSnapShotTree(snap: Snapshot, mode: Mode): void {
  if (fiberRoot) {
    const { current } = fiberRoot;
    circularComponentTable.clear();
    snap.tree = createTree(current);
  }
  sendSnapshot(snap, mode);
}

/**
 * @method traverseRecoilHooks
 * @param memoizedState  Property containing state on a stateful fctnl component's FiberNode object
 * @param memoizedProps Property containing props on a stateful fctnl component's FiberNode object
 * @return An array of array of HookStateItem objects (state and component properties)
 */
function traverseRecoilHooks(memoizedState: any, memoizedProps: any): HookStates {
  const hooksStates: HookStates = [];
  while (memoizedState && memoizedState.queue) {
    if (
      memoizedState.memoizedState
      && memoizedState.queue.lastRenderedReducer
      && memoizedState.queue.lastRenderedReducer.name === 'basicStateReducer'
    ) {
      if (Object.entries(memoizedProps).length !== 0) {
        hooksStates.push({
          component: memoizedState.queue,
          state: memoizedProps,
        });
      }
    }
    memoizedState = memoizedState.next !== memoizedState ? memoizedState.next : null;
  }

  return hooksStates;
}

/**
 * @method traverseHooks
 * @param memoizedState memoizedState property on a stateful fctnl component's FiberNode object
 * @return An array of array of HookStateItem objects
 *
 * Helper function to traverse through memoizedState and inject instrumentation to update our state tree 
 * every time a hooks component changes state
 */
function traverseHooks(memoizedState: any): HookStates {
  const hooksStates: HookStates = [];
  while (memoizedState && memoizedState.queue) {
    if (
      memoizedState.memoizedState
      && memoizedState.queue.lastRenderedReducer
      && memoizedState.queue.lastRenderedReducer.name === 'basicStateReducer'
    ) {
      hooksStates.push({
        component: memoizedState.queue,
        state: memoizedState.memoizedState,
      });
    }
    memoizedState = memoizedState.next !== memoizedState ? memoizedState.next : null;
  }
  return hooksStates;
}

/**
 * @method createTree
 * @param currentFiber A Fiber object
 * @param tree A Tree object, default initialized to an instance given 'root' and 'root'
 * @param fromSibling A boolean, default initialized to false
 * @return An instance of a Tree object
 * This is a recursive function that runs after every Fiber commit using the following logic:
 * 1. Traverse from FiberRootNode
 * 2. Create an instance of custom Tree class
 * 3. Build a new state snapshot
 */
// This runs after every Fiber commit. It creates a new snapshot
function createTree(
  currentFiber: Fiber,
  tree: Tree = new Tree('root', 'root'),
  fromSibling = false
) {
  // Base case: child or sibling pointed to null
  if (!currentFiber) return null;
  if (!tree) return tree;

  // These have the newest state. We update state and then
  // called updateSnapshotTree()
  const {
    sibling,
    stateNode,
    child,
    memoizedState,
    memoizedProps,
    elementType,
    tag,
    actualDuration,
    actualStartTime,
    selfBaseDuration,
    treeBaseDuration,
  } = currentFiber;

  if (elementType?.name && isRecoil) {
    let pointer = memoizedState;
    while (pointer !== null && pointer !== undefined && pointer.next !== null) {
      pointer = pointer.next;
    }

    if (pointer?.memoizedState[1]?.[0].current) {
      const atomName = pointer.memoizedState[1]?.[0].current.keys().next().value;
      allAtomsRelationship.push([atomName, elementType?.name, 'atoms and components']);
    }

    if (pointer?.memoizedState[1]?.[0].key) {
      const atomName = pointer.memoizedState[1]?.[0].key;
      allAtomsRelationship.push([atomName, elementType?.name, 'atoms and components']);
    }
  }

  let newState: any | { hooksState?: any[] } = {};
  let componentData: {
    hooksState?: any[];
    hooksIndex?: number;
    index?: number;
    actualDuration?: number;
    actualStartTime?: number;
    selfBaseDuration?: number;
    treeBaseDuration?: number;
  } = {};
  let componentFound = false;

  // Check if node is a stateful setState component
  if (stateNode && stateNode.state && (tag === 0 || tag === 1 || tag === 2)) {
    // Save component's state and setState() function to our record for future
    // time-travel state changing. Add record index to snapshot so we can retrieve.
    componentData.index = componentActionsRecord.saveNew(
      stateNode.state,
      stateNode
    );
    newState = stateNode.state;
    componentFound = true;
  }

  let hooksIndex;



  const atomArray = [];
  atomArray.push(memoizedProps);

  // RECOIL HOOKS
  if (
    memoizedState
    && (tag === 0 || tag === 1 || tag === 2 || tag === 10)
    && isRecoil === true
  ) {
    if (memoizedState.queue) {
      // Hooks states are stored as a linked list using memoizedState.next,
      // so we must traverse through the list and get the states.
      // We then store them along with the corresponding memoizedState.queue,
      // which includes the dispatch() function we use to change their state.
      const hooksStates = traverseRecoilHooks(memoizedState, memoizedProps);
      hooksStates.forEach(state => {
        hooksIndex = componentActionsRecord.saveNew(
          state.state,
          state.component
        );
        componentData.hooksIndex = hooksIndex;

        // Improves tree visualization but breaks jump ?
        if (newState && newState.hooksState) {
          newState.push(state.state);
        } else if (newState) {
          newState = [state.state];
        } else {
          newState.push(state.state);
        }
        componentFound = true;
      });
    }
  }

  // Check if node is a hooks useState function
  // REGULAR REACT HOOKS
  if (
    memoizedState
    && (tag === 0 || tag === 1 || tag === 2 || tag === 10)
    && isRecoil === false
  ) {
    if (memoizedState.queue) {
      // Hooks states are stored as a linked list using memoizedState.next,
      // so we must traverse through the list and get the states.
      // We then store them along with the corresponding memoizedState.queue,
      // which includes the dispatch() function we use to change their state.
      const hooksStates = traverseHooks(memoizedState);
      const hooksNames = getHooksNames(elementType.toString());
      hooksStates.forEach((state, i) => {
        hooksIndex = componentActionsRecord.saveNew(
          state.state,
          state.component
        );
        componentData.hooksIndex = hooksIndex;
        if (newState && newState.hooksState) {
          newState.hooksState.push({ [hooksNames[i]]: state.state });
        } else if (newState) {
          newState.hooksState = [{ [hooksNames[i]]: state.state }];
        } else {
          newState = { hooksState: [] };
          newState.hooksState.push({ [hooksNames[i]]: state.state });
        }
        componentFound = true;
      });
    }
  }

  // This grabs stateless components
  if (!componentFound && (tag === 0 || tag === 1 || tag === 2)) {
    newState = 'stateless';
  }

  // Adds performance metrics to the component data
  componentData = {
    ...componentData,
    actualDuration,
    actualStartTime,
    selfBaseDuration,
    treeBaseDuration,
  };

  let newNode = null;
  // We want to add this fiber node to the snapshot
  if (componentFound || newState === 'stateless') {
    if (fromSibling) {
      newNode = tree.addSibling(
        newState,
        elementType ? elementType.name : 'nameless',
        componentData
      );
    } else {
      newNode = tree.addChild(
        newState,
        elementType ? elementType.name : 'nameless',
        componentData
      );
    }
  } else {
    newNode = tree;
  }

  // Recurse on children
  if (child && !circularComponentTable.has(child)) {
    // If this node had state we appended to the children array,
    // so attach children to the newly appended child.
    // Otherwise, attach children to this same node.
    circularComponentTable.add(child); //Prevents grabbing state from same child more than once -- Matt's Notes skipped if in Circ comp Set
    createTree(child, newNode);
  }
  // Recurse on siblings
  if (sibling && !circularComponentTable.has(sibling)) {
    circularComponentTable.add(sibling);
    createTree(sibling, newNode, true);
  }

  /*
  Matt's Notes:
  Child and sibling are from the fiberData Structure. This custom tree will recurse to the end of a child
  */

  return tree;
}

/**
 * @method linkFiber
 * @param snap The current snapshot
 * @param mode The current mode (i.e. jumping, time-traveling, locked, or paused)
 * @return a function to be invoked by index.js that initiates snapshot monitoring
 * linkFiber contains core module functionality, exported as an anonymous function.
 */

 /*
Matt's Notes:
  This function:
    adds a visibility change Listener which runs the visibility change function which sets the doWork property (for active / inactive tab functionality?)
    Updates Snapshots (after throttling them)
    Overrides devTools.onCommitFiberRoot
    Takes a snapshot
 */
export default (snap: Snapshot, mode: Mode): (() => void) => {
  function onVisibilityChange(): void {
    doWork = !document.hidden;
  }

  return () => {
    const devTools = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const reactInstance = devTools ? devTools.renderers.get(1) : null;
    fiberRoot = devTools.getFiberRoots(1).values().next().value;


    /*
    Matt's Notes:

      Overwrites onCommitFiberRoot function attaching a listener that executes Reactime logic
      with every commitFiberRoot call.
*/
    const throttledUpdateSnapshot = throttle(() => updateSnapShotTree(snap, mode), 70);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (reactInstance && reactInstance.version) {
      devTools.onCommitFiberRoot = (function (original) {
        return function (...args) {
          // eslint-disable-next-line prefer-destructuring
          fiberRoot = args[1];
          if (doWork) {
            throttledUpdateSnapshot();
          }
          return original(...args);
        };
      }(devTools.onCommitFiberRoot));
    }
    throttledUpdateSnapshot();
  };
};

/*
  Matt's Notes (react src code):
  From react-reconciler/src/ReactWorkTags.js

export const FunctionComponent = 0;
export const ClassComponent = 1;
export const IndeterminateComponent = 2; // Before we know whether it is function or class
export const HostRoot = 3; // Root of a host tree. Could be nested inside another node.
export const HostPortal = 4; // A subtree. Could be an entry point to a different renderer.
export const HostComponent = 5;
export const HostText = 6;
export const Fragment = 7;
export const Mode = 8;
export const ContextConsumer = 9;
export const ContextProvider = 10;
export const ForwardRef = 11;
export const Profiler = 12;
export const SuspenseComponent = 13;
export const MemoComponent = 14;
export const SimpleMemoComponent = 15;
export const LazyComponent = 16;
export const IncompleteClassComponent = 17;
export const DehydratedFragment = 18;
export const SuspenseListComponent = 19;
export const FundamentalComponent = 20;
export const ScopeComponent = 21;
export const Block = 22;
export const OffscreenComponent = 23;
export const LegacyHiddenComponent = 24;


From shared/ReactSymbols.js

/ The Symbol used to tag the ReactElement-like types. If there is no native Symbol
// nor polyfill, then a plain number is used for performance.
export let REACT_ELEMENT_TYPE = 0xeac7;
export let REACT_PORTAL_TYPE = 0xeaca;
export let REACT_FRAGMENT_TYPE = 0xeacb;
export let REACT_STRICT_MODE_TYPE = 0xeacc;
export let REACT_PROFILER_TYPE = 0xead2;
export let REACT_PROVIDER_TYPE = 0xeacd;
export let REACT_CONTEXT_TYPE = 0xeace;
export let REACT_FORWARD_REF_TYPE = 0xead0;
export let REACT_SUSPENSE_TYPE = 0xead1;
export let REACT_SUSPENSE_LIST_TYPE = 0xead8;
export let REACT_MEMO_TYPE = 0xead3;
export let REACT_LAZY_TYPE = 0xead4;
export let REACT_BLOCK_TYPE = 0xead9;
export let REACT_SERVER_BLOCK_TYPE = 0xeada;
export let REACT_FUNDAMENTAL_TYPE = 0xead5;
export let REACT_SCOPE_TYPE = 0xead7;
export let REACT_OPAQUE_ID_TYPE = 0xeae0;
export let REACT_DEBUG_TRACING_MODE_TYPE = 0xeae1;
export let REACT_OFFSCREEN_TYPE = 0xeae2;
export let REACT_LEGACY_HIDDEN_TYPE = 0xeae3;

if (typeof Symbol === 'function' && Symbol.for) {
  const symbolFor = Symbol.for;
  REACT_ELEMENT_TYPE = symbolFor('react.element');
  REACT_PORTAL_TYPE = symbolFor('react.portal');
  REACT_FRAGMENT_TYPE = symbolFor('react.fragment');
  REACT_STRICT_MODE_TYPE = symbolFor('react.strict_mode');
  REACT_PROFILER_TYPE = symbolFor('react.profiler');
  REACT_PROVIDER_TYPE = symbolFor('react.provider');
  REACT_CONTEXT_TYPE = symbolFor('react.context');
  REACT_FORWARD_REF_TYPE = symbolFor('react.forward_ref');
  REACT_SUSPENSE_TYPE = symbolFor('react.suspense');
  REACT_SUSPENSE_LIST_TYPE = symbolFor('react.suspense_list');
  REACT_MEMO_TYPE = symbolFor('react.memo');
  REACT_LAZY_TYPE = symbolFor('react.lazy');
  REACT_BLOCK_TYPE = symbolFor('react.block');
  REACT_SERVER_BLOCK_TYPE = symbolFor('react.server.block');
  REACT_FUNDAMENTAL_TYPE = symbolFor('react.fundamental');
  REACT_SCOPE_TYPE = symbolFor('react.scope');
  REACT_OPAQUE_ID_TYPE = symbolFor('react.opaque.id');
  REACT_DEBUG_TRACING_MODE_TYPE = symbolFor('react.debug_trace_mode');
  REACT_OFFSCREEN_TYPE = symbolFor('react.offscreen');
  REACT_LEGACY_HIDDEN_TYPE = symbolFor('react.legacy_hidden');
*/
