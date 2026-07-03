// SUPABASE INIT
const supabase = supabase.createClient(
  "https://YOUR_PROJECT.supabase.co",
  "YOUR_PUBLIC_ANON_KEY"
);

document.getElementById("registerStudent").onclick = async () => {

  const fullName = fullName.value;
  const username = username.value;
  const email = email.value;
  const password = password.value;
  const classCode = classCode.value;
  const couponCode = couponCode.value;
  const termsAccepted = terms.checked;

  const file = profileImage.files[0];

  if (!file) {
    alert("A profilkép feltöltése kötelező.");
    return;
  }

  if (!termsAccepted) {
    alert("El kell fogadnod az ÁSZF-et.");
    return;
  }

  // 1) PROFILKÉP FELTÖLTÉSE
  const upload = await supabase.storage
    .from("profile-images")
    .upload(`students/${Date.now()}_${file.name}`, file);

  if (upload.error) {
    alert("Hiba a kép feltöltésekor.");
    return;
  }

  const imageUrl = supabase.storage
    .from("profile-images")
    .getPublicUrl(upload.data.path).data.publicUrl;

  // 2) REGISZTRÁCIÓ
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        status: "student",
        fullName,
        username,
        classCode,
        couponCode,
        profileImage: imageUrl
      }
    }
  });

  if (error) {
    alert("Hiba történt: " + error.message);
    return;
  }

  const userId = data.user.id;

  // 3) OSZTÁLYKÓD ELLENŐRZÉSE
  const { data: classData } = await supabase
    .from("classes")
    .select("id")
    .eq("class_code", classCode)
    .single();

  if (!classData) {
    alert("Érvénytelen osztálykód!");
    return;
  }

  // 4) DIÁK HOZZÁADÁSA AZ OSZTÁLYHOZ
  await supabase.from("class_members").insert({
    class_id: classData.id,
    student_id: userId
  });

  // 5) KUPONKÓD ELLENŐRZÉSE
  if (couponCode.trim() !== "") {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", couponCode)
      .single();

    if (coupon) {
      await supabase.from("student_coupons").insert({
        student_id: userId,
        coupon_id: coupon.id
      });
    }
  }

  alert("Sikeres regisztráció!");
  window.location.href = "/student";
};
