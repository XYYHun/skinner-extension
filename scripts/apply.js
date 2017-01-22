(function()
{
  const storage_s = chrome.storage.sync || chrome.storage.local;
  const storage_l = chrome.storage.local;

  const STYLE_ELEMENT_PREFIX = 'skinner-';

  let enabled;

  let profile_id;
  let template_id_list;

  function update_style_element(index, style)
  {
    // TODO: order issus

    const element_id = STYLE_ELEMENT_PREFIX + index;

    let element = document.getElementById(element_id);

    if (element)
    {
      while (element.firstChild)
        element.removeChild(element.firstChild);
    }
    else
    {
      element = document.createElement('style');
      element.id = element_id;

      document.head.appendChild(element);
    }

    element.appendChild(document.createTextNode(style));
  }

  function disable()
  {
    for (let index in template_id_list)
    {
      const element = document.getElementById(STYLE_ELEMENT_PREFIX + index);

      if (element)
        element.remove();
    }
  }

  function enable()
  {
    chrome.runtime.sendMessage(
      {
        'request-profile-id' : true,
        'request-template-ids' : true,
        'url': location.href,
      },
      function(response)
      {
        disable();

        profile_id = response['profile-id'];
        template_id_list = response['template-ids'];

        if (profile_id == 'disabled')
          return;

        if (template_id_list)
          chrome.runtime.sendMessage(
            {
              'request-generated-style' : true,
              'profile-id' : profile_id,
              'template-id-list' : template_id_list,
            });
      });
  }

  storage_l.get('enabled', function(data)
  {
    enabled = data.enabled;

    if (enabled)
      enable();

    chrome.storage.onChanged.addListener(function(changes, namespace)
    {
      if (changes.enabled)
      {
        enabled = changes.enabled.newValue;

        if (enabled)
          enable();
        else
          disable();

        return;
      }

      if (enabled)
      {
        if (('options-' + profile_id) in changes)
        {
          enable();
  
          return;
        }

        if ('force-update' in changes)
        {
          enable();
  
          return;
        }
      }

    });

  });

  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse)
    {
      let response = {};

      if (request['response-generated-style'])
        update_style_element(request.index, request.style);

      if (request['profile-updated'] && enabled)
        enable();

      sendResponse(response);
    });

})();