import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationTemplateRenderer {
  private readonly variableRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  render(rawMessage: string, variables: Record<string, string>): string {
    return rawMessage.replace(this.variableRegex, (_match: string, variableName: string) => {
      return variables[variableName] ?? `{{${variableName}}}`;
    });
  }

  extractVariables(rawMessage: string): string[] {
    const vars = new Set<string>();
    for (const match of rawMessage.matchAll(this.variableRegex)) {
      if (match[1]) vars.add(match[1]);
    }
    return Array.from(vars);
  }
}

