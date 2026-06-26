import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

const TextContentPartSchema = Type.Object({
  type: Type.Literal("text"),
  text: Type.String()
});

const MessageSchema = Type.Object({
  role: Type.Union([
    Type.Literal("system"),
    Type.Literal("user"),
    Type.Literal("assistant"),
    Type.Literal("tool")
  ]),
  content: Type.Array(TextContentPartSchema, { minItems: 1 })
});

const ToolSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.String(),
  input_schema: Type.Record(Type.String(), Type.Unknown()),
  strict: Type.Boolean()
});

const GenerationSchema = Type.Object({
  max_output_tokens: Type.Integer({ minimum: 1 }),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  reasoning_effort: Type.Optional(
    Type.Union([
      Type.Literal("minimal"),
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("xhigh")
    ])
  ),
  response_format: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("json_object"), Type.Literal("json_schema")])),
  strict_json_schema: Type.Optional(Type.Boolean())
});

export const TurnStartMessageSchema = Type.Object({
  type: Type.Literal("turn.start"),
  request_id: Type.String({ minLength: 1 }),
  profile_id: Type.String({ minLength: 1 }),
  messages: Type.Array(MessageSchema, { minItems: 1 }),
  tools: Type.Optional(Type.Array(ToolSchema)),
  generation: GenerationSchema
});

const ToolResultPayloadSchema = Type.Union([
  Type.Object({
    status: Type.Literal("success"),
    content: Type.Unknown()
  }),
  Type.Object({
    status: Type.Literal("error"),
    code: Type.String(),
    message: Type.String()
  })
]);

export const TurnToolResultMessageSchema = Type.Object({
  type: Type.Literal("turn.tool_result"),
  turn_id: Type.String({ minLength: 1 }),
  call_id: Type.String({ minLength: 1 }),
  result: ToolResultPayloadSchema
});

export type TurnStartMessage = Static<typeof TurnStartMessageSchema>;
export type TurnToolResultMessage = Static<typeof TurnToolResultMessageSchema>;
export type ClientMessage = TurnStartMessage | TurnToolResultMessage;
