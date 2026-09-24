import {z} from 'zod';
export const PROMPT_MAX_LENGTH=600;
export const creationPromptSchema=z.string().trim().min(12).max(PROMPT_MAX_LENGTH);
