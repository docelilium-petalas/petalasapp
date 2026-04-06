import zipfile
import xml.etree.ElementTree as ET

docx_file = r'C:\Users\henri\Downloads\pétalas\Documento Base - Doce Lilium.docx'
with zipfile.ZipFile(docx_file) as docx:
    xml_content = docx.read('word/document.xml')
    tree = ET.fromstring(xml_content)
    namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    texts = [text.text for text in tree.findall('.//w:t', namespaces) if text.text]
    with open(r'C:\Users\henri\Downloads\pétalas\documento.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(texts))
