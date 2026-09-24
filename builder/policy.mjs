// This policy runs in the trusted broker, never in the agent's container.
export function parseReasoningEffort(value = 'high') {
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(value)) {
    throw new Error('Invalid builder reasoning effort');
  }
  return value;
}

export class ModelPolicy {
  constructor({model, reasoningEffort='high', maxCalls=40, maxInputBytes=8_000_000, maxOutputTokens=120_000, outputPerCall=12_000, deadline=Date.now()+600_000}) {
    Object.assign(this,{model,maxCalls,maxInputBytes,maxOutputTokens,outputPerCall,deadline});
    this.reasoningEffort = parseReasoningEffort(reasoningEffort);
    this.usage={calls:0,inputBytes:0,reservedOutputTokens:0};
  }
  reserve(request) {
    if(Date.now()>=this.deadline)throw new Error('Builder model deadline exceeded');
    if(!request||typeof request!=='object'||!Array.isArray(request.input))throw new Error('Invalid Responses input');
    // No hosted tools, URL images, previous remote conversations or provider routing.
    if(request.previous_response_id||request.conversation)throw new Error('Remote conversation access is disabled');
    if((request.tools??[]).some(t=>!['function','custom'].includes(t.type)))throw new Error('Hosted tools are disabled');
    const inspect=value=>{
      if(!value||typeof value!=='object')return;
      if(['input_file','item_reference'].includes(value.type))throw new Error('Remote files and stored items are disabled');
      if(value.type==='input_image'&&(!/^data:image\/(png|jpeg|webp);base64,/.test(value.image_url??'')||value.file_id))throw new Error('Remote images are disabled');
      for(const child of Object.values(value))inspect(child);
    };inspect(request.input);
    const body={model:this.model,input:request.input,instructions:request.instructions,tools:request.tools??[],tool_choice:'auto',parallel_tool_calls:false,stream:true,store:false,include:['reasoning.encrypted_content'],max_output_tokens:this.outputPerCall,reasoning:{effort:this.reasoningEffort},...(request.text?{text:request.text}:{})};
    const next={calls:this.usage.calls+1,inputBytes:this.usage.inputBytes+Buffer.byteLength(JSON.stringify(body)),reservedOutputTokens:this.usage.reservedOutputTokens+this.outputPerCall};
    if(next.calls>this.maxCalls||next.inputBytes>this.maxInputBytes||next.reservedOutputTokens>this.maxOutputTokens)throw new Error('Builder model budget exhausted');
    Object.assign(this.usage,next);return body;
  }
  settle(outputTokens){if(Number.isInteger(outputTokens)&&outputTokens>=0&&outputTokens<=this.outputPerCall)this.usage.reservedOutputTokens-=this.outputPerCall-outputTokens;}
}
