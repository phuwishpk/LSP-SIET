"""
Seed catalogue for course rooms: the undergraduate programmes (สาขาวิชา) of the
School of Industrial Education and Technology, KMITL, as categories, and five
real courses from each programme's current curriculum, so a fresh workspace has
something to browse before any teacher logs in.

Source: the programme pages on siet.kmitl.ac.th and the curriculum documents
(มคอ.2 PDFs, พ.ศ. 2562–2570) they link; codes, Thai names and credits were read
from those documents on 2026-10-22. See docs/report/4.3 for the per-programme
references. Programme 2 (ครุศาสตร์วิศวกรรม) and 9 (ครุศาสตร์การออกแบบ) cite 2562
base documents that later สมอ.08 amendments may have renumbered.

Seeding is idempotent and never overwrites what a teacher has typed: a category
is matched by ``slug``, a course by ``code`` (see ``repository.ensure_course``).
Edit the lists, restart the API, and only the new rows appear. A course code
shared by several programmes (the faculty's teacher-profession block, e.g.
03206107) is filed under the first programme that lists it.
"""

from __future__ import annotations

from typing import Any, Dict, List

from loguru import logger

from siet_community import repository as repo

# slug, Thai name, English name, display order (tens = department).
# "general" is the catch-all a room lands in when nothing fits; it sorts last.
CATEGORIES: List[Dict[str, Any]] = [
    # ภาควิชาครุศาสตร์อุตสาหกรรม
    {"slug": "learning-management-science", "name": "วิทยาการจัดการเรียนรู้", "name_en": "Learning Management Science", "sort_order": 11},
    # ภาควิชาครุศาสตร์วิศวกรรม
    {"slug": "engineering-education", "name": "ครุศาสตร์วิศวกรรม", "name_en": "Engineering Education", "sort_order": 22},
    {"slug": "electronics-and-telecommunications", "name": "อิเล็กทรอนิกส์และโทรคมนาคม", "name_en": "Electronics and Telecommunications", "sort_order": 23},
    {"slug": "computer-technology", "name": "เทคโนโลยีคอมพิวเตอร์", "name_en": "Computer Technology", "sort_order": 24},
    {"slug": "electronics-technology", "name": "เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง)", "name_en": "Electronics Technology", "sort_order": 25},
    {"slug": "digital-industry-and-smart-systems", "name": "อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง)", "name_en": "Digital Industry and Smart Systems", "sort_order": 26},
    # ภาควิชาครุศาสตร์สถาปัตยกรรมและการออกแบบ
    {"slug": "architecture", "name": "สถาปัตยกรรม", "name_en": "Architecture", "sort_order": 37},
    {"slug": "interior-environmental-design", "name": "การออกแบบสภาพแวดล้อมภายใน", "name_en": "Interior Environmental Design", "sort_order": 38},
    {"slug": "design-education", "name": "ครุศาสตร์การออกแบบ", "name_en": "Design Education", "sort_order": 39},
    {"slug": "design-innovation-and-technology", "name": "นวัตกรรมและเทคโนโลยีการออกแบบ", "name_en": "Design Innovation and Technology", "sort_order": 40},
    {"slug": "integrated-innovation-for-products-and-services", "name": "บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง)", "name_en": "Integrated Innovation for Products and Services", "sort_order": 41},
    {"slug": "architectural-media-technology", "name": "เทคโนโลยีสื่อสถาปัตยกรรม", "name_en": "Architectural Media Technology", "sort_order": 42},
    # ภาควิชาครุศาสตร์เกษตร
    {"slug": "agricultural-education", "name": "ครุศาสตร์เกษตร", "name_en": "Agricultural Education", "sort_order": 53},
    {"slug": "general", "name": "ทั่วไป", "name_en": "General", "sort_order": 999},
]

# code, name (Thai + English), one-line note (credits · degree · curriculum year), category slug.
COURSES: List[Dict[str, Any]] = [
    # วิทยาการจัดการเรียนรู้ (Learning Management Science)
    {"code": "03206107", "name": "พื้นฐานการศึกษาสำหรับวิชาชีพครู (Educational Foundation for Teacher Profession)", "description": "3(3-0-6) · ค.อ.บ. วิทยาการจัดการเรียนรู้ · หลักสูตร พ.ศ. 2568", "category": "learning-management-science"},
    {"code": "03246001", "name": "สะเต็มศึกษา (STEM Education)", "description": "3(2-2-5) · ค.อ.บ. วิทยาการจัดการเรียนรู้ · หลักสูตร พ.ศ. 2568", "category": "learning-management-science"},
    {"code": "03246002", "name": "แคลคูลัสเบื้องต้น (Preliminary Calculus)", "description": "3(3-0-6) · ค.อ.บ. วิทยาการจัดการเรียนรู้ · หลักสูตร พ.ศ. 2568", "category": "learning-management-science"},
    {"code": "03246101", "name": "ฟิสิกส์พื้นฐาน (Fundamental Physics)", "description": "3(3-0-6) · ค.อ.บ. วิทยาการจัดการเรียนรู้ · หลักสูตร พ.ศ. 2568", "category": "learning-management-science"},
    {"code": "03246202", "name": "การเรียนรู้คณิตศาสตร์สำหรับมัธยมศึกษาตอนต้น (Mathematics for Secondary School)", "description": "3(3-0-6) · ค.อ.บ. วิทยาการจัดการเรียนรู้ · หลักสูตร พ.ศ. 2568", "category": "learning-management-science"},
    # ครุศาสตร์วิศวกรรม (Engineering Education)
    {"code": "03376501", "name": "คณิตศาสตร์วิศวกรรม (Engineering Mathematics)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์วิศวกรรม · หลักสูตร พ.ศ. 2562", "category": "engineering-education"},
    {"code": "03376502", "name": "วิศวกรรมไฟฟ้า (Electrical Engineering)", "description": "3(2-2-5) · ค.อ.บ. ครุศาสตร์วิศวกรรม · หลักสูตร พ.ศ. 2562", "category": "engineering-education"},
    {"code": "03376503", "name": "เขียนแบบวิศวกรรม (Engineering Drawing)", "description": "3(2-2-5) · ค.อ.บ. ครุศาสตร์วิศวกรรม · หลักสูตร พ.ศ. 2562", "category": "engineering-education"},
    {"code": "03376506", "name": "อิเล็กทรอนิกส์พื้นฐาน (Fundamental Electronics)", "description": "3(2-2-5) · ค.อ.บ. ครุศาสตร์วิศวกรรม · หลักสูตร พ.ศ. 2562", "category": "engineering-education"},
    {"code": "03376404", "name": "การปฏิบัติการสอนในสถานศึกษา 1 (Teaching Practice in Educational Institute 1)", "description": "6(0-18-9) · ค.อ.บ. ครุศาสตร์วิศวกรรม · หลักสูตร พ.ศ. 2562", "category": "engineering-education"},
    # อิเล็กทรอนิกส์และโทรคมนาคม (Electronics and Telecommunications)
    {"code": "03396104", "name": "อุปกรณ์และวงจรอิเล็กทรอนิกส์ (Electronic Devices and Circuits)", "description": "3(2-2-5) · ค.อ.บ. อิเล็กทรอนิกส์และโทรคมนาคม · หลักสูตร พ.ศ. 2567", "category": "electronics-and-telecommunications"},
    {"code": "03396105", "name": "หลักการแก้ปัญหาและการเขียนโปรแกรมเบื้องต้น (Principles of Problem Solving and Basic Programming)", "description": "3(2-2-5) · ค.อ.บ. อิเล็กทรอนิกส์และโทรคมนาคม · หลักสูตร พ.ศ. 2567", "category": "electronics-and-telecommunications"},
    {"code": "03396106", "name": "วงจรดิจิทัลและวงจรตรรกพื้นฐาน (Basic Digital and Logic Circuit)", "description": "3(2-2-5) · ค.อ.บ. อิเล็กทรอนิกส์และโทรคมนาคม · หลักสูตร พ.ศ. 2567", "category": "electronics-and-telecommunications"},
    {"code": "03396108", "name": "การปฏิบัติงานอิเล็กทรอนิกส์และโทรคมนาคม 1 (Electronics and Telecommunications Laboratory 1)", "description": "3(0-6-3) · ค.อ.บ. อิเล็กทรอนิกส์และโทรคมนาคม · หลักสูตร พ.ศ. 2567", "category": "electronics-and-telecommunications"},
    {"code": "03306041", "name": "การปฏิบัติการสอนในสถานศึกษา 1 (Teaching Practice in Educational Institute 1)", "description": "6(0-18-9) · ค.อ.บ. อิเล็กทรอนิกส์และโทรคมนาคม · หลักสูตร พ.ศ. 2567", "category": "electronics-and-telecommunications"},
    # เทคโนโลยีคอมพิวเตอร์ (Computer Technology)
    {"code": "03376116", "name": "พื้นฐานการออกแบบและพัฒนาซอฟต์แวร์ (Principle of Software Design and Development)", "description": "3(2-2-5) · ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ · หลักสูตร พ.ศ. 2567", "category": "computer-technology"},
    {"code": "03376117", "name": "ระบบคอมพิวเตอร์ (Computer Systems)", "description": "3(2-2-5) · ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ · หลักสูตร พ.ศ. 2567", "category": "computer-technology"},
    {"code": "03376118", "name": "อุปกรณ์และวงจรแอนะล็อกเบื้องต้น (Fundamental of Analog Devices and Circuits)", "description": "3(2-2-5) · ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ · หลักสูตร พ.ศ. 2567", "category": "computer-technology"},
    {"code": "03206113", "name": "การวิจัยในชั้นเรียน (Classroom Research)", "description": "3(2-2-5) · ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ · หลักสูตร พ.ศ. 2567", "category": "computer-technology"},
    {"code": "03300009", "name": "การปฏิบัติการสอนในสถานศึกษา 1 (Teaching Practice in Educational Institute 1)", "description": "6(0-18-9) · ค.อ.บ. เทคโนโลยีคอมพิวเตอร์ · หลักสูตร พ.ศ. 2567", "category": "computer-technology"},
    # เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) (Electronics Technology)
    {"code": "03386404", "name": "คณิตศาสตร์วิศวกรรมอิเล็กทรอนิกส์ (Electronics Engineering Mathematics)", "description": "3(3-0-6) · ทล.บ. เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2567", "category": "electronics-technology"},
    {"code": "03386405", "name": "การออกแบบวงจรแอนะล็อกและดิจิทัลอิเล็กทรอนิกส์ (Analog and Digital Electronics Circuits Design)", "description": "3(2-2-5) · ทล.บ. เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2567", "category": "electronics-technology"},
    {"code": "03386407", "name": "การเขียนโปรแกรมและการประยุกต์ใช้งาน (Programming and Applications)", "description": "3(2-2-5) · ทล.บ. เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2567", "category": "electronics-technology"},
    {"code": "03386409", "name": "อินเทอร์เน็ตของสรรพสิ่ง (Internet of Things)", "description": "3(2-2-5) · ทล.บ. เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2567", "category": "electronics-technology"},
    {"code": "03386411", "name": "การสื่อสารข้อมูลและเครือข่ายข้อมูล (Data Communications and Networking)", "description": "3(2-2-5) · ทล.บ. เทคโนโลยีอิเล็กทรอนิกส์ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2567", "category": "electronics-technology"},
    # อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) (Digital Industry and Smart Systems)
    {"code": "03916101", "name": "พื้นฐานเทคโนโลยีอุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (Introduction to Digital Industrial Technology and Smart Systems)", "description": "3(3-0-6) · ทล.บ. อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2570", "category": "digital-industry-and-smart-systems"},
    {"code": "03916102", "name": "การเขียนโปรแกรมสำหรับงานอุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (Programming for Digital Industry and Smart System Applications)", "description": "3(2-2-5) · ทล.บ. อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2570", "category": "digital-industry-and-smart-systems"},
    {"code": "03916103", "name": "เซนเซอร์และอุปกรณ์กระทำในอุตสาหกรรม (Industrial Sensors and Actuators)", "description": "3(2-2-5) · ทล.บ. อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2570", "category": "digital-industry-and-smart-systems"},
    {"code": "03916107", "name": "ระบบเทคโนโลยีไอโอทีภาคอุตสาหกรรม (Industrial-IoT Systems)", "description": "3(2-2-5) · ทล.บ. อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2570", "category": "digital-industry-and-smart-systems"},
    {"code": "03916108", "name": "ปัญญาประดิษฐ์และการเรียนรู้เครื่องจักรในงานอุตสาหกรรม (Industrial Artificial Intelligence and Machine Learning)", "description": "3(2-2-5) · ทล.บ. อุตสาหกรรมดิจิทัลและระบบอัจฉริยะ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2570", "category": "digital-industry-and-smart-systems"},
    # สถาปัตยกรรม (Architecture)
    {"code": "03416701", "name": "การออกแบบสถาปัตยกรรม 1 (Architectural Design 1)", "description": "6(4-6-11) · ค.อ.บ. สถาปัตยกรรม · หลักสูตร พ.ศ. 2569", "category": "architecture"},
    {"code": "03416702", "name": "การออกแบบสถาปัตยกรรม 2 (Architectural Design 2)", "description": "6(4-6-11) · ค.อ.บ. สถาปัตยกรรม · หลักสูตร พ.ศ. 2569", "category": "architecture"},
    {"code": "03416011", "name": "การฝึกประสบการณ์วิชาชีพระหว่างเรียน 1 (Professional Teaching Practice 1)", "description": "3(0-6-5) · ค.อ.บ. สถาปัตยกรรม · หลักสูตร พ.ศ. 2569", "category": "architecture"},
    {"code": "03416015", "name": "การปฏิบัติการสอนในสถานศึกษา (Teaching Practice in Educational Institute)", "description": "7(0-21-11) · ค.อ.บ. สถาปัตยกรรม · หลักสูตร พ.ศ. 2569", "category": "architecture"},
    {"code": "03206116", "name": "การจัดการสถานศึกษา (Institutions Management)", "description": "3(3-0-6) · ค.อ.บ. สถาปัตยกรรม · หลักสูตร พ.ศ. 2569", "category": "architecture"},
    # การออกแบบสภาพแวดล้อมภายใน (Interior Environmental Design)
    {"code": "03456150", "name": "ประวัติศาสตร์ศิลป์ (Art History)", "description": "3(3-0-6) · ค.อ.บ. การออกแบบสภาพแวดล้อมภายใน · หลักสูตร พ.ศ. 2569", "category": "interior-environmental-design"},
    {"code": "03456151", "name": "วิจิตรศิลป์ (Fine Art)", "description": "3(1-6-5) · ค.อ.บ. การออกแบบสภาพแวดล้อมภายใน · หลักสูตร พ.ศ. 2569", "category": "interior-environmental-design"},
    {"code": "03456152", "name": "พื้นฐานการออกแบบและสุนทรียศาสตร์ทางสภาพแวดล้อมภายใน (Fundamental Design for Interior Environmental Aesthetics)", "description": "3(2-3-6) · ค.อ.บ. การออกแบบสภาพแวดล้อมภายใน · หลักสูตร พ.ศ. 2569", "category": "interior-environmental-design"},
    {"code": "03456153", "name": "ทฤษฎีและที่ว่างเพื่อการสร้างสรรค์สภาพแวดล้อมภายใน (Interior Environmental Design Theory and Space Planning)", "description": "3(2-3-6) · ค.อ.บ. การออกแบบสภาพแวดล้อมภายใน · หลักสูตร พ.ศ. 2569", "category": "interior-environmental-design"},
    {"code": "03456154", "name": "วาดเส้น (Arts of Delineation)", "description": "3(1-6-5) · ค.อ.บ. การออกแบบสภาพแวดล้อมภายใน · หลักสูตร พ.ศ. 2569", "category": "interior-environmental-design"},
    # ครุศาสตร์การออกแบบ (Design Education)
    {"code": "03506155", "name": "วาดเส้นเพื่อการออกแบบผลิตภัณฑ์ (Deline for Product Design)", "description": "3(2-3-6) · ค.อ.บ. ครุศาสตร์การออกแบบ · หลักสูตร พ.ศ. 2562", "category": "design-education"},
    {"code": "03506156", "name": "การยศาสตร์เพื่อครุศาสตร์การออกแบบ (Ergonomics of Design)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์การออกแบบ · หลักสูตร พ.ศ. 2562", "category": "design-education"},
    {"code": "03506157", "name": "เขียนแบบผลิตภัณฑ์ (Drawing of Product Design)", "description": "3(2-3-6) · ค.อ.บ. ครุศาสตร์การออกแบบ · หลักสูตร พ.ศ. 2562", "category": "design-education"},
    {"code": "03506158", "name": "สุนทรียศาสตร์เพื่อครุศาสตร์การออกแบบ (Aesthetics of Design)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์การออกแบบ · หลักสูตร พ.ศ. 2562", "category": "design-education"},
    {"code": "03506160", "name": "ประวัติศาสตร์และวิวัฒนาการในการออกแบบผลิตภัณฑ์ (History and Evolution in Product Design)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์การออกแบบ · หลักสูตร พ.ศ. 2562", "category": "design-education"},
    # นวัตกรรมและเทคโนโลยีการออกแบบ (Design Innovation and Technology)
    {"code": "03506803", "name": "สุนทรียศาสตร์เพื่อการออกแบบ (Design Aesthetics)", "description": "3(2-3-6) · ค.อ.บ. นวัตกรรมและเทคโนโลยีการออกแบบ · หลักสูตร พ.ศ. 2567", "category": "design-innovation-and-technology"},
    {"code": "03506808", "name": "วิทยาการและเทคโนโลยีดิจิทัลเพื่อการออกแบบ (Digital Science and Technology for Design)", "description": "3(2-3-6) · ค.อ.บ. นวัตกรรมและเทคโนโลยีการออกแบบ · หลักสูตร พ.ศ. 2567", "category": "design-innovation-and-technology"},
    {"code": "03506810", "name": "นวัตกรรมการออกแบบผลิตภัณฑ์ (Product Design Innovation and Technology)", "description": "3(2-3-6) · ค.อ.บ. นวัตกรรมและเทคโนโลยีการออกแบบ · หลักสูตร พ.ศ. 2567", "category": "design-innovation-and-technology"},
    {"code": "03506813", "name": "นวัตกรรม วิเคราะห์ สร้างสรรค์เพื่อการออกแบบ (Creative Innovational Design Analytics)", "description": "3(2-3-6) · ค.อ.บ. นวัตกรรมและเทคโนโลยีการออกแบบ · หลักสูตร พ.ศ. 2567", "category": "design-innovation-and-technology"},
    {"code": "03506819", "name": "เทคโนโลยีการออกแบบกราฟิกและบรรจุภัณฑ์เพื่อการประกอบธุรกิจ (Graphic and Package Design Tecnology for Business)", "description": "3(2-3-6) · ค.อ.บ. นวัตกรรมและเทคโนโลยีการออกแบบ · หลักสูตร พ.ศ. 2567", "category": "design-innovation-and-technology"},
    # บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) (Integrated Innovation for Products and Services)
    {"code": "03706600", "name": "พื้นฐานการออกแบบบ้านและผลิตภัณฑ์ (Fundamentals Home and Product Design)", "description": "3(2-3-6) · ทล.บ. บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2568", "category": "integrated-innovation-for-products-and-services"},
    {"code": "03706601", "name": "วัสดุ นวัตกรรม และเทคโนโลยี (Materials Innovation and Technology)", "description": "3(2-3-6) · ทล.บ. บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2568", "category": "integrated-innovation-for-products-and-services"},
    {"code": "03706701", "name": "การจัดการผลิตภัณฑ์และแบรนด์สินค้า (Products and Brand Management)", "description": "3(2-3-6) · ทล.บ. บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2568", "category": "integrated-innovation-for-products-and-services"},
    {"code": "03706703", "name": "การวางแผนและการควบคุมระบบการผลิต (Production Planning and Control Systems)", "description": "4(2-6-7) · ทล.บ. บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2568", "category": "integrated-innovation-for-products-and-services"},
    {"code": "03706800", "name": "โครงงานบูรณาการนวัตกรรม (Integrated Innovation Project)", "description": "3(0-9-0) · ทล.บ. บูรณาการนวัตกรรมเพื่อสินค้าและบริการ (ต่อเนื่อง) · หลักสูตร พ.ศ. 2568", "category": "integrated-innovation-for-products-and-services"},
    # เทคโนโลยีสื่อสถาปัตยกรรม (Architectural Media Technology)
    {"code": "03716001", "name": "การออกแบบกราฟิก (Graphic Design)", "description": "3(2-3-6) · วท.บ. เทคโนโลยีสื่อสถาปัตยกรรม · หลักสูตร พ.ศ. 2570", "category": "architectural-media-technology"},
    {"code": "03716003", "name": "แอนิเมชันพื้นฐาน (Basic Animation)", "description": "3(2-3-6) · วท.บ. เทคโนโลยีสื่อสถาปัตยกรรม · หลักสูตร พ.ศ. 2570", "category": "architectural-media-technology"},
    {"code": "03716005", "name": "แบบจำลองสารสนเทศอาคารเพื่องานสถาปัตยกรรม 1 (Building Information Modeling for Architectural 1)", "description": "3(2-3-6) · วท.บ. เทคโนโลยีสื่อสถาปัตยกรรม · หลักสูตร พ.ศ. 2570", "category": "architectural-media-technology"},
    {"code": "03716011", "name": "การออกแบบและการสื่อสารสถาปัตยกรรม 1 (Architectural Design and Media 1)", "description": "6(4-6-11) · วท.บ. เทคโนโลยีสื่อสถาปัตยกรรม · หลักสูตร พ.ศ. 2570", "category": "architectural-media-technology"},
    {"code": "03716017", "name": "ศิลปะและภาพร่าง (Arts and Delineation)", "description": "3(2-3-6) · วท.บ. เทคโนโลยีสื่อสถาปัตยกรรม · หลักสูตร พ.ศ. 2570", "category": "architectural-media-technology"},
    # ครุศาสตร์เกษตร (Agricultural Education)
    {"code": "03606743", "name": "หลักการศึกษาเกษตร (Principles of Agricultural Education)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์เกษตร · หลักสูตร พ.ศ. 2567", "category": "agricultural-education"},
    {"code": "03606744", "name": "ปรัชญาของเศรษฐกิจพอเพียงกับการศึกษาเกษตร (Philosophy of Sufficiency Economic and Agricultural Education)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์เกษตร · หลักสูตร พ.ศ. 2567", "category": "agricultural-education"},
    {"code": "03606739", "name": "การฝึกปฏิบัติวิชาชีพครูเกษตร 1 (Professional Agricultural Teachers Practice 1)", "description": "3(2-3-6) · ค.อ.บ. ครุศาสตร์เกษตร · หลักสูตร พ.ศ. 2567", "category": "agricultural-education"},
    {"code": "03606741", "name": "การปฏิบัติการสอนในสถานศึกษา 1 (Teaching Practice in Education Institute 1)", "description": "6(0-18-9) · ค.อ.บ. ครุศาสตร์เกษตร · หลักสูตร พ.ศ. 2567", "category": "agricultural-education"},
    {"code": "03206107", "name": "พื้นฐานการศึกษาสำหรับวิชาชีพครู (Educational Foundation for Teacher Profession)", "description": "3(3-0-6) · ค.อ.บ. ครุศาสตร์เกษตร · หลักสูตร พ.ศ. 2567", "category": "agricultural-education"},  # also listed by an earlier programme
    # demo rooms from the first install (kept so existing posts keep their room)
    {"code": "CS101", "name": "Data Structure", "description": "โครงสร้างข้อมูลและอัลกอริทึมพื้นฐาน", "category": "general"},
    {"code": "CS201", "name": "Web Technology", "description": "การพัฒนาเว็บ ฝั่งหน้าบ้านและหลังบ้าน", "category": "general"},
    {"code": "CS301", "name": "OS & Linux", "description": "ระบบปฏิบัติการและการใช้งาน Linux", "category": "general"},
    {"code": "CS302", "name": "Computer Network", "description": "เครือข่ายคอมพิวเตอร์และโปรโตคอล", "category": "general"},
]


async def seed_catalog() -> Dict[str, int]:
    """Create missing categories and courses. Safe to run on every start."""
    ids: Dict[str, int] = {}
    for cat in CATEGORIES:
        ids[cat["slug"]] = await repo.ensure_category(
            cat["slug"], cat["name"], cat.get("name_en"), int(cat.get("sort_order") or 0)
        )
    for course in COURSES:
        await repo.ensure_course(
            course["code"],
            course["name"],
            course.get("description"),
            category_id=ids.get(course.get("category") or ""),
            term=course.get("term"),
        )
    logger.info(f"Community catalogue seeded: {len(ids)} categories, {len(COURSES)} courses")
    return {"categories": len(ids), "courses": len(COURSES)}
