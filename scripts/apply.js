(function()
{
  const storage_s = chrome.storage.sync || chrome.storage.local;
  const storage_l = chrome.storage.local;

  const STYLE_ELEMENT_PREFIX = 'skinner-';

  let generated_style_id_list = [];

  let enabled;

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
    for (let index in generated_style_id_list)
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
        const profile_id = response['profile-id'];
        const template_ids = response['template-ids'];

        if (profile_id == 'disabled')
        {
          disable();

          return;
        }

        for (let index in template_ids)
        {
          chrome.runtime.sendMessage(
            {
              'request-generated-style' : true,
              'index' : index,
              'profile-id' : profile_id,
              'template-id' : template_ids[index],
            }, function(response)
            {
              generated_style_id_list[index] = response['generated-style-id'];
            });
        }
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
      }

      if (enable)
      {
        for (let index in generated_style_id_list)
        {
          let generated_style_id = generated_style_id_list[index];

          if (generated_style_id in changes)
            update_style_element(index, changes[generated_style_id].newValue);
        }
      }
    });

  });

  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse)
    {
      let response = {};

      if (request['update-style'])
        update_style_element(request.index, request.style);

      if (request['profile-updated'] && enabled)
        enable();

      sendResponse(response);
    });

})();