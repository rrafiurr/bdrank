const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined;

let loadPromise: Promise<void> | null = null;

export function isFacebookConfigured(): boolean {
  return !!FB_APP_ID;
}

// loadFacebookSDK injects and initializes the Facebook JS SDK once.
export function loadFacebookSDK(): Promise<void> {
  if (!FB_APP_ID) return Promise.reject(new Error("Facebook not configured"));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve) => {
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v19.0",
      });
      resolve();
    };
    const id = "facebook-jssdk";
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const js = document.createElement("script");
    js.id = id;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  });
  return loadPromise;
}

// facebookLogin opens the FB login dialog and resolves with an access token.
export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const FB = (window as any).FB;
    if (!FB) {
      reject(new Error("Facebook SDK not loaded"));
      return;
    }
    FB.login(
      (response: any) => {
        if (response.authResponse?.accessToken) {
          resolve(response.authResponse.accessToken);
        } else {
          reject(new Error("Facebook login cancelled"));
        }
      },
      { scope: "email,public_profile" }
    );
  });
}
