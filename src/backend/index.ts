/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable consistent-return */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 'reactime' module has a single export
 * @function linkFiber
 */


 /*
  Matt's Notes:
    This is injected directly into the DOM. The "backend" folder is bundled via webpack and injected into the DOM via 
    the background script. That's how many of these functions have direct access to the window object. 
 */
import 'core-js';
import 'regenerator-runtime/runtime';
import linkFiberStart from './linkFiber';
import timeJumpStart from './timeJump';
import {
  Snapshot, Mode, SnapshotNode, MsgData,
} from './types/backendTypes';

// * State snapshot object initialized here
const snapShot: Snapshot = {
  tree: null,
  unfilteredTree: null,
};

const mode: Mode = {
  jumping: false,
  paused: false,
  locked: false,
};

const linkFiber = linkFiberStart(snapShot, mode);
const timeJump = timeJumpStart(snapShot, mode);

function getRouteURL(node: SnapshotNode): string {
  if (node.name === 'Router') {
    return node.state.location.pathname;
  }
  if (node.children && node.children.length >= 1) {
    const tempNode: any[] = node.children;
    for (let index = 0; index < tempNode.length; index += 1) {
      return getRouteURL(tempNode[index]); // Carlos: ???
    }
  }
}

// * Event listener for time-travel actions
window.addEventListener('message', ({ data: { action, payload } }: MsgData) => {
  switch (action) {
    case 'jumpToSnap':
      timeJump(payload, true); // * This sets state with given payload
      // Get the pathname from payload and add new entry to browser history
      // MORE: https://developer.mozilla.org/en-US/docs/Web/API/History/pushState

      // try to modify workInProgress tree from here
      // window.history.pushState('', '', getRouteURL(payload));
      break;
    case 'setLock':
      mode.locked = payload;
      break;
    case 'setPause':
      mode.paused = payload;
      break;
    default:
      break;
  }
});

linkFiber();
