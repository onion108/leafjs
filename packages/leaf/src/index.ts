import { Reactive, ReactiveObject } from '@leaf-web/reactivity';
import {
  appendContentToNode,
  ElementContent,
  ElementProps,
  isNodeLike,
  isNodeListLike,
  preservedProps,
} from './common';

export type LeafComponentRenderResult = HTMLElement | HTMLElement[];
export type LeafEventHandler = (e: Event) => unknown;

type EventListener = { name: string; handler: LeafEventHandler };
export type EventListenerMap = WeakMap<HTMLElement, Set<EventListener>>;

export type LeafComponentPropValue = any;
export type LeafComponentProps = { [key: string]: LeafComponentPropValue };
export type LeafComponentAttribute = string | number | boolean;

export const eventListeners: EventListenerMap = new WeakMap();
/** Attributes to be updated specially, such as `input.value` vs `input.attributes.value` */
export const directPropUpdate = [{ name: 'value', attr: 'value' }];

export const reactiveInstances = new Map<string, Reactive>();

/**
 * Check if an attribute is an event handler.
 * @param propName Attribute name to check.
 * @param _propContent Attribute value to assert.
 * @returns Is this attribute an event handler.
 */
export const isEventListener = (propName: string, _propContent: any): _propContent is LeafEventHandler => {
  return propName.startsWith('on');
};

/**
 * Check is a node an element node.
 * @param node `Node` object to check.
 * @returns Is `node` an element node.
 */
export const isElement = (node: Node): node is HTMLElement => {
  return node.nodeType === Node.ELEMENT_NODE;
};

const isLeafComponent = (element: any): element is LeafComponent => {
  return element.isLeafComponent === true;
};

const isTextNode = (node: Node): node is Text => {
  return node.nodeType === Node.TEXT_NODE;
};

/**
 * Check is a value a valid Leaf attribute.
 * @param attr Attribute value to check.
 * @returns Is `attr` a valid Leafjs attribute.
 */
export const isValidAttribute = (attr: any): attr is LeafComponentAttribute => {
  return typeof attr === 'string' || typeof attr === 'number' || typeof attr === 'boolean';
};

const _createElement = (
  tag: string | typeof LeafComponent,
  props?: Record<string, string | boolean | LeafEventHandler>,
  content?: ElementContent | ElementContent[]
): HTMLElement => {
  if (typeof tag !== 'string') {
    const tagName = window.componentMap?.get(tag);
    if (!tagName) throw new Error('Unable to fetch component from registery.');
    else tag = tagName;
  }

  const element: LeafComponent | HTMLElement = document.createElement(tag);
  const listeners = new Set<EventListener>();

  for (const prop in props) {
    const propContent = props[prop];

    if (isEventListener(prop, propContent)) {
      const listenerName = prop.substring(2).toLowerCase();
      listeners.add({ name: listenerName, handler: propContent });
      element.addEventListener(listenerName, propContent);
      continue;
    }

    if (isLeafComponent(element)) {
      element.props[prop] = propContent;
      if (!isValidAttribute(propContent)) continue;
    }

    if (propContent === false || propContent === null || propContent === undefined) continue;

    if (prop in preservedProps) {
      element.setAttribute(preservedProps[prop], propContent.toString());
    } else {
      element.setAttribute(prop, propContent.toString());
    }
  }
  eventListeners.set(element, listeners);
  if (content) {
    appendContentToNode(element, content);
  }
  return element;
};

/**
 * Create a new `HTMLElement` with given information.
 * @param tag Element tag.
 * @param content Optional element initial content.
 * @param props Optional element attributes.
 * @returns Created HTML element.
 */
export const createElement = (
  tag: string | typeof LeafComponent,
  content?: ElementContent | ElementContent[] | ElementProps,
  props?: ElementProps
): HTMLElement => {
  if (typeof content === 'undefined') return _createElement(tag);
  if (!isNodeLike(content) && !isNodeListLike(content)) {
    return _createElement(tag, content as ElementProps);
  }
  return _createElement(tag, props, content as ElementContent);
};

/**
 * Create a new `HTMLElement` with given information, `React.createElement` style.
 * @param tag Element tag.
 * @param props Optional element attributes.
 * @param content Optional element initial content.
 * @returns Created HTML element.
 */
export const createElementReactStyle = (
  tag: string | typeof LeafComponent,
  props?: ElementProps,
  ...content: ElementContent[]
): HTMLElement => {
  if (!content) return createElement(tag, props ?? {});
  return createElement(tag, content, props ?? {});
};

/**
 * Get event listeners of an element created by `createElement`.
 * @param element Element to check event listner list
 * @returns A set of event listener objects.
 */
export const getEventListenerOf = (element: HTMLElement) => {
  if (!eventListeners.has(element)) return undefined;
  return eventListeners.get(element);
};

export const setEventListenerOf = (element: HTMLElement, listeners?: Set<EventListener>) => {
  eventListeners.set(element, listeners || new Set());
};

export const deleteEventListenerOf = (element: HTMLElement) => {
  return eventListeners.delete(element);
};

/**
 * Invoke a function with either invoking one-by-one through a list or invoking directly.
 * @param elements Element or element list.
 * @param callback Function to invoke.
 */
export const runCallbackOnElements = (
  elements: LeafComponentRenderResult,
  callback: (element: HTMLElement) => void
) => {
  if (isNodeListLike(elements)) {
    for (const ele of elements as HTMLElement[]) {
      if (Array.isArray(ele)) {
        runCallbackOnElements(ele, callback);
        continue;
      }
      callback(ele);
    }
  } else {
    callback(elements as HTMLElement);
  }
};

/**
 * Mount a list of elements to DOM.
 * @param children A list of children to mount.
 * @param container The container DOM element to contain the children.
 */
export const mountElements = (children: Node[], container: Node) => {
  children.forEach((child) => {
    container.appendChild(child);
  });
};

/**
 * Patch an element from one state to another.
 * @param oldChildren Children of `oldParent`.
 * @param newChildren Children of `newParent`.
 * @param oldParent The previously existing DOM element to patch.
 * @param newParent The newly generated element, unattached to DOM.
 */
export const patchElements = (
  oldChildren: (HTMLElement | Node)[],
  newChildren: Node[],
  oldParent: Node,
  newParent: Node
) => {
  if (!oldParent) return;

  let oldLen = oldChildren.length,
    newLen = newChildren.length;

  if (isElement(oldParent) && isElement(newParent)) {
    // replace event listeners
    const oldEventListener = getEventListenerOf(oldParent);
    const newEventListener = getEventListenerOf(newParent);

    oldEventListener?.forEach((value) => {
      oldParent.removeEventListener(value.name, value.handler);
    });

    newEventListener?.forEach((value) => {
      oldParent.addEventListener(value.name, value.handler);
    });

    // IMPORTANT: update the event listener registery for future use
    setEventListenerOf(oldParent, newEventListener);
    deleteEventListenerOf(newParent);
  }

  for (let i = 0, j = 0; Math.max(i, j) < Math.min(oldLen, newLen); i++, j++) {
    let oldChild = oldChildren[i];
    const newChild = newChildren[j];

    // IMPORTANT: filter out preserved elements, in this case `<style />` tag
    if (isElement(oldChild) && oldChild.hasAttribute('leaf-preserve')) {
      oldChild = oldChildren[++i];
      oldLen--;
    }

    // special optimizing for Leaf components
    if (isLeafComponent(oldChild)) oldChild.isUpdating = true;
    if (isLeafComponent(newChild)) newChild.isUpdating = true;

    // process attributes here so `connectedCallback` will receive the correct attribute
    if (isElement(oldChild) && isElement(newChild)) {
      // replace attributes
      const oldAttributes = Array.prototype.slice.call(oldChild.attributes);
      const newAttributes = Array.prototype.slice.call(newChild.attributes);

      for (const attr of newAttributes) {
        // don't assign objects to attributes, assign to properties only
        if (!isValidAttribute(attr.value) || oldChild.getAttribute(attr.name) === attr.value) continue;
        if (attr.value === false || attr.value === null || attr.value === undefined) continue;

        oldChild.setAttribute(attr.name, attr.value);

        for (const specialProp of directPropUpdate) {
          if (specialProp.name !== attr.name) continue;
          // @ts-ignore
          oldChild[specialProp.name] = attr.value;
        }
      }

      for (const attr of oldAttributes) {
        // only remove the attribute if it's not in the new element
        if (newChild.hasAttribute(attr.name)) continue;
        oldChild.removeAttribute(attr.name);
      }
    }

    if (isElement(oldChild) && isElement(newChild) && oldChild.tagName !== newChild.tagName) {
      let referenceElement = oldChild.previousSibling;

      oldChild.outerHTML = oldChild.outerHTML
        .replace(new RegExp(`<${oldChild.tagName.toLowerCase()}(.*?)`, 'g'), `<${newChild.tagName.toLowerCase()}$1`)
        .replace(new RegExp(`</${oldChild.tagName.toLowerCase()}(.*?)`, 'g'), `</${newChild.tagName.toLowerCase()}$1`);

      // IMPORTANT: setting outerHTML will not update the element reference itself,
      // so refreshing the element by a reference element is needed
      if (referenceElement) {
        oldChild = referenceElement.nextSibling as Node;
      } else {
        oldChild = oldParent.firstChild as Node;
      }

      if (!isElement(oldChild)) continue;

      if (isLeafComponent(oldChild)) oldChild.isUpdating = true;
    }

    // update properties for Leaf components
    if (isLeafComponent(oldChild) && isLeafComponent(newChild)) {
      // always keep attributes and props in-sync
      for (const attr of newChild.attributes) {
        // property is higher than attributes
        if (attr.name in newChild.props) continue;
        oldChild.props[attr.name] = attr.value;
      }

      for (const prop in newChild.props) {
        oldChild.props[prop] = newChild.props[prop];
      }

      for (const prop in oldChild.props) {
        if (prop in newChild.props || newChild.hasAttribute(prop)) continue;
        delete oldChild.props[prop];
      }
    }

    if (isTextNode(oldChild) && isTextNode(newChild)) {
      if (oldChild.textContent === newChild.textContent) continue;
      oldParent.replaceChild(newChild, oldChild);
      continue;
    }

    if (isTextNode(oldChild) && isElement(newChild)) {
      oldParent.replaceChild(newChild, oldChild);
      oldChild = newChild;
      if (isLeafComponent(oldChild)) oldChild.isUpdating = true;
    }

    if (isElement(oldChild) && isTextNode(newChild)) {
      oldParent.replaceChild(newChild, oldChild);
      continue;
    }

    patchElements(Array.from(oldChild.childNodes), Array.from(newChild.childNodes), oldChild, newChild);

    if (isLeafComponent(oldChild)) {
      oldChild.isUpdating = false;
      oldChild.rerender();
    }
  }

  // insert new elements
  if (newLen > oldLen) {
    newChildren.slice(oldLen).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        oldParent.appendChild(child);
        return;
      }
      mountElements([child], oldParent);
    });
    return;
  }

  // remove old elements
  if (newLen < oldLen) {
    oldChildren.slice(newLen).forEach((child) => {
      oldParent.removeChild(child);
    });
  }
};

/**
 * Helper function for defining CSS stylesheets.
 * @param styles Stylesheet string.
 * @returns Stylesheet string.
 */
export const css = (styles: TemplateStringsArray, ...keys: any[]) => {
  let constructedStyle = '';
  let curKeyIndex = 0;
  styles.forEach((style) => {
    constructedStyle += style + keys[curKeyIndex++];
  });
  return constructedStyle;
};

/**
 * Core Leaf component class.
 *
 * This class is a thin wrapper of `HTMLElement` class and integrates a shadow DOM within.
 */
export class LeafComponent extends HTMLElement {
  #state: ReactiveObject | null = null;
  #reactiveInstance: Reactive | null = null;
  #previousRenderResult: HTMLElement[] | null = null;
  #shadow: ShadowRoot | null = null;
  #key: string | null | undefined = undefined;
  #isMounted: boolean = false;
  #styleElement: HTMLElement | null = null;
  props: LeafComponentProps = {};
  isLeafComponent = true;
  isUpdating = false;

  /**
   * @see https://github.com/Microsoft/TypeScript/issues/3841#issuecomment-337560146
   */
  ['constructor']: typeof LeafComponent;

  constructor() {
    super();

    const props: LeafComponentProps = {};

    // initialize properties
    for (const attr of this.constructor.observedAttributes) {
      props[attr] = null;
    }

    const outerThis = this;

    const checkIsPropValid = (key: string, value?: any) => {
      if (!this.constructor.observedAttributes.includes(key)) {
        // throw an error if `key` isn't defined by the component
        throw new Error(
          `Unknown property ${key}. Expected one of ${this.constructor.observedAttributes
            .map((attr) => `'${attr}'`)
            .join(', ')}.`
        );
      }

      if (
        Array.isArray(this.constructor.watchedProps) ||
        !(key in this.constructor.watchedProps) ||
        value === undefined ||
        value === null ||
        this.isUpdating
      )
        return;

      if (this.constructor.watchedProps[key] !== value.constructor) {
        throw new TypeError(
          `Types of property '${key}' unmatch: expected ${this.constructor.watchedProps[key].name}, got ${value.constructor.name}`
        );
      }
    };

    const previousPropChange = {
      name: '',
      value: null,
    };

    this.props = new Proxy(props, {
      get(target, key: string, receiver) {
        checkIsPropValid(key);
        return Reflect.get(target, key, receiver);
      },
      set(target, key: string, value, receiver) {
        checkIsPropValid(key, value);
        const result = Reflect.set(target, key, value, receiver);

        if (
          outerThis.#isMounted &&
          key !== 'key' &&
          (previousPropChange.name !== key || previousPropChange.value !== value)
        ) {
          outerThis.onPropChange(key, value);
          previousPropChange.name = key;
          previousPropChange.value = value;
        }

        if (outerThis.#isMounted) outerThis.rerender();
        return result;
      },
      has(_target, key: string) {
        return outerThis.constructor.observedAttributes.includes(key);
      },
      deleteProperty(target, key: string) {
        checkIsPropValid(key);
        return Reflect.deleteProperty(target, key);
      },
    });
  }

  static watchedProps: string[] | Record<string, any> = [];

  static get observedAttributes(): string[] {
    const userProps: string[] = [];

    if (!Array.isArray(this.watchedProps)) {
      for (const key in this.watchedProps) {
        userProps.push(key);
      }
    } else {
      userProps.push(...this.watchedProps);
    }

    return [...userProps, 'key'];
  }

  setState<T extends ReactiveObject>(newState: T) {
    this.#state = newState;
  }

  getState(): ReactiveObject {
    if (!this.#isMounted) return {};
    return this.#state;
  }

  /** Component inner state. */
  get state(): ReactiveObject {
    return this.getState();
  }

  /** {@inheritDoc LeafComponent.state} */
  set state(value: ReactiveObject) {
    this.setState(value);
  }

  /** Event listeners attached to component. */
  get listeners(): EventListener[] {
    return Array.from(getEventListenerOf(this) || []);
  }

  /**
   * Dispatch a custom event to listeners.
   * @param event Event object or name to fire.
   * @param data Extra data to pass to `CustomEvent.detail`.
   * @returns Is the fired event's `preventDefault` hook called.
   */
  fireEvent(event: string | Event, data?: Record<string, any>): boolean {
    if (event instanceof Event) {
      // stop bubbling to prevent multiple invokation of the event
      event.stopPropagation();
      return this.fireEvent(event.type, data);
    }
    const toDispatch = new CustomEvent(event, { detail: data });
    return this.dispatchEvent(toDispatch);
  }

  /**
   * Rerender the component based on current state.
   */
  rerender() {
    if (!this.#shadow || this.isUpdating || !this.#isMounted || this.#reactiveInstance?.isSetting) return;
    if (this.#reactiveInstance) this.#reactiveInstance.isSetting = true;

    if (!this.#previousRenderResult) {
      this.onMounted();
    } else {
      this.onRerender();
    }

    if (this.#styleElement) this.#styleElement.textContent = this.css();

    let renderResult = this.render();
    if (!Array.isArray(renderResult)) renderResult = [renderResult];

    if (this.#reactiveInstance) this.#reactiveInstance.isSetting = false;

    if (!this.#previousRenderResult) {
      mountElements(renderResult, this.#shadow);
      this.#previousRenderResult = renderResult;
      return;
    }

    patchElements(Array.from(this.#shadow.childNodes), Array.from(renderResult), this.#shadow, renderResult[0]);
    this.#previousRenderResult = renderResult;
  }

  /**
   * Callback when the component is mounted.
   */
  onMounted() {
    return;
  }

  /**
   * Callback when the component is about to perform a rerender.
   */
  onRerender() {
    return;
  }

  /**
   * Callback when a property of the component has changed.
   * @param name Name of changed property.
   * @param newValue The updated value of property.
   */
  onPropChange<T extends any>(name: string, newValue: T) {
    return;
  }

  /**
   * Start component lifecycle.
   *
   * This function is invoked when the first initialization of the component.
   */
  connectedCallback() {
    this.#isMounted = true;

    this.#shadow = this.attachShadow({ mode: 'closed' });
    this.#styleElement = createElement('style');

    this.#styleElement.textContent = this.css();
    this.#styleElement.setAttribute('leaf-preserve', 'true');
    this.#shadow.appendChild(this.#styleElement);

    const currentInstance = reactiveInstances.get(this.#key || '');

    // adopt the previous reactive data, if any
    if (currentInstance) this.#reactiveInstance = currentInstance;
    // or create a new one
    else this.#reactiveInstance = new Reactive();

    if (this.#reactiveInstance?.actualState) {
      this.#state = this.#reactiveInstance.actualState;
    } else {
      this.#state = this.#reactiveInstance?.build(this.#state ?? {});
    }

    // IMPORTANT: only set the current `Reactive` instance when the key is valid
    if (this.#reactiveInstance && this.#key) reactiveInstances.set(this.#key, this.#reactiveInstance);

    this.#reactiveInstance?.onStateChange(() => this.rerender());
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    if (oldVal === newVal) return;

    // handle keying
    if (name === 'key') {
      this.#key = newVal;
    }

    // rerender when attributes changed
    if (!Array.isArray(this.constructor.watchedProps)) {
      if (this.constructor.watchedProps[name] === Number) this.props[name] = parseFloat(newVal);
      else this.props[name] = newVal;
    } else {
      this.props[name] = newVal;
    }
  }

  /**
   * Core rendering logic of a component.
   * @returns HTML element to be rendered and attached.
   */
  render(): LeafComponentRenderResult {
    throw new Error('Render function of `LeafComponent` must be overrided.');
  }

  /**
   * Inject CSS stylesheet to component. If not given, leaf will inject an empty string by default.
   *
   * Not to be confused with the builtin prop `style`.
   * @returns CSS stylesheet string.
   */
  css(): string {
    return '';
  }
}

export { Reactive } from '@leaf-web/reactivity';
export { registerComponent } from './common';
