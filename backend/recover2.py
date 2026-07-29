import os
import re
import json

transcript_path = r'C:\Users\aman kesarwani201\.gemini\antigravity\brain\7fc3a4f2-81e7-4949-8731-56ea88b7e315\.system_generated\logs\transcript_full.jsonl'
file_contents = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        # We can just use string matching since it's JSONL
        if 'File Path: ile:///' in line:
            # Parse the JSON
            try:
                step = json.loads(line)
            except:
                continue
                
            # If it's a tool response, the content might be in step['content'] or step['tool_responses'][0]['output']
            content = ""
            if 'content' in step and isinstance(step['content'], str):
                content = step['content']
            elif 'tool_calls' in step:
                continue
                
            # Let's just find the string in the raw line to be safe
            raw = step.get('content', '')
            if isinstance(raw, str) and 'File Path: ile:///' in raw:
                match = re.search(r'File Path: ile:///(.*?)', raw)
                if match:
                    path_match = match.group(1).replace('%20', ' ').replace('/', '\\\\')
                    
                    code_lines = []
                    in_code = False
                    for l in raw.split('\n'):
                        if re.match(r'^\d+: ', l):
                            in_code = True
                            code_lines.append(l.split(': ', 1)[1])
                        elif in_code and l.startswith('The above content shows the entire'):
                            in_code = False
                    
                    if code_lines:
                        file_contents[path_match.lower()] = '\n'.join(code_lines)

# Also let's extract write_to_file from the transcript
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'write_to_file' in line:
            try:
                step = json.loads(line)
                if 'tool_calls' in step:
                    for tc in step['tool_calls']:
                        if tc.get('name') == 'write_to_file':
                            args = tc.get('args', {})
                            if 'TargetFile' in args and 'CodeContent' in args:
                                file_contents[args['TargetFile'].lower()] = args['CodeContent']
            except:
                pass

print(f"Extracted {len(file_contents)} files from transcript.")
recovered = 0
for path, content in file_contents.items():
    if path.endswith('.py') and ('backend\\\\app' in path or 'pipeline' in path):
        if os.path.exists(path) and os.path.getsize(path) == 0:
            with open(path, 'w', encoding='utf-8') as out:
                out.write(content)
            print(f"Recovered: {path}")
            recovered += 1

print(f"Total recovered: {recovered}")
