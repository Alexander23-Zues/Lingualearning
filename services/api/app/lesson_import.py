"""Extract plain lesson text from supported document types."""
from io import BytesIO
from pathlib import PurePath
from zipfile import BadZipFile, ZipFile

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from pypdf import PdfReader
from pypdf.errors import PyPdfError

MAX_LESSON_FILE_BYTES = 2_000_000
MAX_LESSON_TEXT_BYTES = 30_000
_WORD = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extract_lesson_text(filename: str, content: bytes) -> str:
    extension = PurePath(filename).suffix.lower()
    if extension not in {".txt", ".pdf", ".docx"}:
        raise ValueError("Choose a PDF, Word (.docx), or UTF-8 text (.txt) file.")
    if len(content) > MAX_LESSON_FILE_BYTES:
        raise ValueError("Choose a file under 2 MB.")
    try:
        if extension == ".txt":
            text = content.decode("utf-8-sig")
        elif extension == ".docx":
            with ZipFile(BytesIO(content)) as archive:
                document = archive.getinfo("word/document.xml")
                if document.file_size > 2_000_000:
                    raise ValueError("The Word document is too large. Split it into shorter files.")
                root = ElementTree.fromstring(archive.read(document))
            paragraphs = []
            for paragraph in root.iter(f"{_WORD}p"):
                runs = []
                for node in paragraph.iter():
                    if node.tag == f"{_WORD}t":
                        runs.append(node.text or "")
                    elif node.tag in {f"{_WORD}br", f"{_WORD}cr"}:
                        runs.append("\n")
                    elif node.tag == f"{_WORD}tab":
                        runs.append("\t")
                paragraphs.append("".join(runs))
            text = "\n".join(paragraphs)
        else:
            if not content.startswith(b"%PDF-"):
                raise ValueError("Choose a valid PDF file.")
            pdf = PdfReader(BytesIO(content))
            if pdf.is_encrypted:
                raise ValueError("Open the PDF and save an unlocked copy before importing.")
            if len(pdf.pages) > 30:
                raise ValueError("Use a PDF with up to 30 pages.")
            text = "\n\n".join(page.extract_text() or "" for page in pdf.pages)
    except (BadZipFile, PyPdfError, ElementTree.ParseError, DefusedXmlException,
            KeyError, RuntimeError, UnicodeError, NotImplementedError) as error:
        raise ValueError("Could not read the file. Try saving it again or using a UTF-8 text file.") from error
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if any(ord(char) < 32 and char not in "\t\n" for char in text):
        raise ValueError("The file contains unsupported text characters.")
    if not text:
        raise ValueError("No readable text was found. For scanned pages, use a text copy or an OCR-exported file.")
    if len(text.encode("utf-8")) > MAX_LESSON_TEXT_BYTES:
        raise ValueError("The lesson text is too long. Split the file into shorter lessons.")
    return text
