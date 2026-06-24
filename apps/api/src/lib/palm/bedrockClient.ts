import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

let _client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

export async function invokeModel(modelId: string, body: unknown): Promise<unknown> {
  const cmd = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });
  const res = await getClient().send(cmd);
  return JSON.parse(Buffer.from(res.body).toString('utf-8'));
}

export async function* invokeModelStream(
  modelId: string,
  body: unknown,
): AsyncGenerator<string> {
  const cmd = new InvokeModelWithResponseStreamCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });
  const res = await getClient().send(cmd);
  for await (const event of res.body ?? []) {
    if (event.chunk?.bytes) {
      const parsed = JSON.parse(
        Buffer.from(event.chunk.bytes).toString('utf-8'),
      ) as { type?: string; delta?: { type?: string; text?: string } };
      if (
        parsed.type === 'content_block_delta' &&
        parsed.delta?.type === 'text_delta'
      ) {
        yield parsed.delta.text ?? '';
      }
    }
  }
}
