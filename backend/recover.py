import json
import re
import os

transcript_path = r'C:\Users\aman kesarwani201\.gemini\antigravity\brain\7fc3a4f2-81e7-4949-8731-56ea88b7e315\.system_generated\logs\transcript_full.jsonl'

file_contents = {}

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
        except:
            continue
            
        # Parse tool calls for write_to_file
        if 'tool_calls' in step:
            for tc in step['tool_calls']:
                if tc.get('name') == 'write_to_file':
                    args = tc.get('args', {})
                    if 'TargetFile' in args and 'CodeContent' in args:
                        file_contents[args['TargetFile'].lower()] = args['CodeContent']
                        
        # Parse output for view_file
        if 'content' in step and 'File Path: ' in step['content']:
            content = step['content']
            match = re.search(r'File Path: ile:///(.*?)', content)
            if match:
                path_match = match.group(1).replace('%20', ' ')
                # Convert path_match from c:/... to c:\...
                path_match = path_match.replace('/', '\\\\')
                
                # Extract the code block
                lines = content.split('\n')
                code_lines = []
                in_code = False
                for l in lines:
                    if re.match(r'^\d+: ', l):
                        in_code = True
                        code_lines.append(l.split(': ', 1)[1])
                    elif in_code and l.startswith('The above content shows the entire'):
                        in_code = False
                
                if code_lines:
                    file_contents[path_match.lower()] = '\n'.join(code_lines)

# Write recovered files
recovered = 0
for path, content in file_contents.items():
    if path.endswith('.py') and ('backend\\\\app' in path or 'pipeline' in path):
        # Double check if file exists and is empty
        if os.path.exists(path) and os.path.getsize(path) == 0:
            with open(path, 'w', encoding='utf-8') as out:
                out.write(content)
            print(f"Recovered: {path}")
            recovered += 1

print(f"Total recovered: {recovered}")
