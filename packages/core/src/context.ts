import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Options for the {@link ContextSource.gather} method.
 */
export interface ContextSourceGatherOptions {
  /**
   * An optional `AbortSignal` to cancel the context gathering operation.
   */
  readonly signal?: AbortSignal;
}

/**
 * The result of gathering context from a {@link ContextSource}.
 */
export interface ContextResult {
  /**
   * The gathered context content as a string.
   */
  readonly content: string;

  /**
   * Optional metadata about the gathered context.
   */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base properties shared by all context sources.
 */
interface ContextSourceBase {
  /**
   * A unique identifier for the context source.
   */
  readonly name: string;

  /**
   * A human-readable description of what this context source provides.
   * For passive sources, this description helps the LLM decide when to use it.
   */
  readonly description: string;
}

/**
 * A context source that is automatically invoked during the translation
 * pipeline.  Required sources are always executed before translation begins.
 */
export interface RequiredContextSource extends ContextSourceBase {
  /**
   * Indicates that this source is always invoked.
   */
  readonly mode: "required";

  /**
   * Gathers context.  Called automatically during the translation pipeline.
   *
   * @param options Optional settings for the gathering operation.
   * @returns A promise that resolves to the gathered context.
   */
  gather(options?: ContextSourceGatherOptions): Promise<ContextResult>;
}

/**
 * A context source that can be invoked by the LLM agent when needed.
 * Passive sources are exposed as tools that the agent can choose to call.
 *
 * @typeParam TParams The type of parameters accepted by the {@link gather}
 *                    method.
 */
export interface PassiveContextSource<TParams> extends ContextSourceBase {
  /**
   * Indicates that this source is invoked by the LLM agent on demand.
   */
  readonly mode: "passive";

  /**
   * A Standard Schema defining the parameters for the {@link gather} method.
   * This schema is used to generate the tool definition for the LLM.
   */
  readonly parameters: StandardSchemaV1<TParams>;

  /**
   * Gathers context based on the provided parameters.
   *
   * @param params The parameters for gathering context, validated against
   *               the {@link parameters} schema.
   * @param options Optional settings for the gathering operation.
   * @returns A promise that resolves to the gathered context.
   */
  gather(
    params: TParams,
    options?: ContextSourceGatherOptions,
  ): Promise<ContextResult>;
}

/**
 * A source that provides additional context for translation.
 *
 * Context sources can operate in two modes:
 *
 * - `"required"`: Always invoked at the start of the translation pipeline.
 *   Use this for context that is essential for every translation, such as
 *   author biography or document metadata.
 *
 * - `"passive"`: Exposed as a tool that the LLM agent can invoke on demand.
 *   Use this for context that may or may not be needed, such as fetching
 *   linked articles or looking up terminology.
 *
 * @typeParam TParams The type of parameters for passive sources.
 */
export type ContextSource<TParams = unknown> =
  | RequiredContextSource
  | PassiveContextSource<TParams>;

/**
 * A factory function that creates a {@link ContextSource}.
 *
 * Factory functions are the recommended way to create context sources,
 * as they allow for configuration validation and dependency injection.
 *
 * @typeParam TOptions The type of options accepted by the factory.
 * @typeParam TParams The type of parameters for passive sources.
 * @param options Configuration options for the context source.
 * @returns A configured context source.
 *
 * @example Create a factory for fetching author information
 * ```typescript
 * interface AuthorBioOptions {
 *   readonly authorId: string;
 *   readonly fetchBio: (id: string) => Promise<string>;
 * }
 *
 * const createAuthorBioSource: ContextSourceFactory<AuthorBioOptions> =
 *   (options) => ({
 *     name: "author-bio",
 *     description: "Fetches the author's biography for context",
 *     mode: "required",
 *     async gather(gatherOptions) {
 *       const bio = await options.fetchBio(options.authorId, gatherOptions);
 *       return { content: bio };
 *     },
 *   });
 * ```
 */
export type ContextSourceFactory<
  TOptions,
  TParams = unknown,
> = (options: TOptions) => ContextSource<TParams>;
