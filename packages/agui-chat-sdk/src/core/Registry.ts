import React from 'react';
import { CustomEvent, ActivityMessage } from "@ag-ui/core";

export interface CustomEventDefinition<T = any> {
  name: string;
  render: React.ComponentType<{ value: T; event: CustomEvent }>;
}

export class CustomEventRegistry {
  private defs = new Map<string, CustomEventDefinition>();

  register(def: CustomEventDefinition) {
    this.defs.set(def.name, def);
  }

  resolve(name: string) {
    return this.defs.get(name);
  }
}

export interface ActivityRendererProps {
  message: ActivityMessage;
}

export type ActivityRenderer = React.ComponentType<ActivityRendererProps>;

export class ActivityRendererRegistry {
  private renderers = new Map<string, ActivityRenderer>();

  register(activityType: string, renderer: ActivityRenderer) {
    this.renderers.set(activityType, renderer);
  }

  resolve(activityType: string) {
    return this.renderers.get(activityType);
  }
}
