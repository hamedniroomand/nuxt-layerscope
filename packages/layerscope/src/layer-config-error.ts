import { LayerscopeError } from './errors.ts';

/** A layer name in the config that matches no layer. */
export class LayerConfigError extends LayerscopeError {
  public override name = 'LayerConfigError';
}
