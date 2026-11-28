from io import BytesIO
from zipfile import ZipFile

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from test_api import AccountRole, client_for, create_app, TestClient


def test_imports_supported_formats_without_creating_a_material():
    client, _ = client_for(AccountRole.educator)
    docx = BytesIO()
    with ZipFile(docx, "w") as archive:
        archive.writestr("word/document.xml", '''
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body><w:p><w:r><w:t>Read the lesson.</w:t></w:r></w:p></w:body>
          </w:document>''')
    writer = PdfWriter()
    page = writer.add_blank_page(240, 200)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): DictionaryObject({
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }),
        }),
    })
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 20 100 Td (Read the lesson.) Tj ET")
    page.replace_contents(stream)
    pdf = BytesIO()
    writer.write(pdf)
    for name, payload in [("lesson.txt", b"Read the lesson."), ("lesson.docx", docx.getvalue()), ("lesson.pdf", pdf.getvalue())]:
        response = client.post("/v1/lessons/import", files={"file": (name, payload)})
        assert response.status_code == 200
        assert response.json() == {"text": "Read the lesson."}


def test_rejects_invalid_files_and_unauthenticated_imports():
    client, _ = client_for(AccountRole.educator)
    for name, content in [("broken.pdf", b"invalid"), ("lesson.doc", b"legacy"), ("lesson.txt", b"   ")]:
        assert client.post("/v1/lessons/import", files={"file": (name, content)}).status_code == 422
    too_large = client.post("/v1/lessons/import", files={"file": ("lesson.txt", b"x" * 2_020_001)})
    assert too_large.status_code == 413
    anonymous = TestClient(create_app())
    assert anonymous.post("/v1/lessons/import", files={"file": ("lesson.txt", b"Read.")}).status_code == 401
