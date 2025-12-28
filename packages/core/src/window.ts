/**
 * Strategy for managing context window limits.
 *
 * - {@link ExplicitContextWindow}: User explicitly specifies the maximum
 *   token count.
 * - {@link AdaptiveContextWindow}: Dynamically detects limits by retrying
 *   with smaller chunks when token limit errors occur.
 */
export type ContextWindow = ExplicitContextWindow | AdaptiveContextWindow;

/**
 * User explicitly specifies the maximum token count.
 */
export interface ExplicitContextWindow {
  /**
   * Indicates that the token limit is explicitly specified.
   */
  readonly type: "explicit";

  /**
   * The maximum number of tokens allowed in the context window.
   */
  readonly maxTokens: number;
}

/**
 * Dynamically detects limits by retrying with smaller chunks when token
 * limit errors occur.
 */
export interface AdaptiveContextWindow {
  /**
   * Indicates that the token limit is dynamically detected.
   */
  readonly type: "adaptive";

  /**
   * The initial token count to try before adapting.
   *
   * @default `16384`
   */
  readonly initialMaxTokens?: number;

  /**
   * The minimum token count before giving up.  If the chunk size falls below
   * this threshold, an error is thrown instead of retrying.
   *
   * @default `1024`
   */
  readonly minTokens?: number;
}
